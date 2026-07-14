import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import type { RentPactEscrow, MockUSDC, TenancyCredential } from "../typechain-types";

const Frequency = { Monthly: 0, Quarterly: 1, Yearly: 2, Daily: 3, Hourly: 4 } as const;
const ResolutionType = { Settlement: 0, Arbitration: 1, AutoFallback: 2 } as const;
const BPS = 10_000;

const INTERVAL_SECONDS: Record<number, number> = {
  [Frequency.Monthly]: 30 * 24 * 60 * 60,
  [Frequency.Quarterly]: 90 * 24 * 60 * 60,
  [Frequency.Yearly]: 365 * 24 * 60 * 60,
  [Frequency.Daily]: 24 * 60 * 60,
  [Frequency.Hourly]: 60 * 60,
};

const SETTLEMENT_WINDOW = 7 * 24 * 60 * 60;
const ARBITRATION_WINDOW = 5 * 24 * 60 * 60;
const CAUTION_CLAIM_WINDOW = 7 * 24 * 60 * 60;

const USDC = (n: number) => ethers.parseUnits(n.toString(), 6);
const CONSTITUTION_HASH = ethers.keccak256(ethers.toUtf8Bytes("test-constitution-v1"));

async function deployFixture() {
  const [deployer, tenant, landlord, arbiter, stranger] = await ethers.getSigners();

  const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
  const usdc = (await MockUSDCFactory.deploy()) as unknown as MockUSDC;
  await usdc.waitForDeployment();

  const EscrowFactory = await ethers.getContractFactory("RentPactEscrow");
  const escrow = (await EscrowFactory.deploy(
    await usdc.getAddress(),
    arbiter.address,
    CONSTITUTION_HASH,
  )) as unknown as RentPactEscrow;
  await escrow.waitForDeployment();

  // Fund tenant with a generous USDC balance and approve the escrow.
  await usdc.mint(tenant.address, USDC(1_000_000));
  await usdc.connect(tenant).approve(await escrow.getAddress(), ethers.MaxUint256);

  const CredentialFactory = await ethers.getContractFactory("TenancyCredential");
  const credential = (await CredentialFactory.deploy(await escrow.getAddress())) as unknown as TenancyCredential;
  await credential.waitForDeployment();
  await escrow.connect(deployer).setCredentialContract(await credential.getAddress());

  return { deployer, tenant, landlord, arbiter, stranger, usdc, escrow, credential };
}

async function createSignedLease(
  fixture: Awaited<ReturnType<typeof deployFixture>>,
  amountPerPeriod: bigint,
  periods: number,
  frequency: number,
  cautionAmount = 0n,
) {
  const { escrow, tenant, landlord } = fixture;
  const tx = await escrow
    .connect(tenant)
    .createLease(landlord.address, amountPerPeriod, periods, frequency, cautionAmount);
  const receipt = await tx.wait();
  const event = receipt!.logs
    .map((log) => {
      try {
        return escrow.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e?.name === "LeaseCreated");
  const leaseId = event!.args.leaseId as bigint;

  await escrow.connect(landlord).signLease(leaseId);
  return leaseId;
}

describe("RentPactEscrow", () => {
  describe("constructor", () => {
    it("records the constitutionHash immutably", async () => {
      const { escrow } = await loadFixture(deployFixture);
      expect(await escrow.constitutionHash()).to.equal(CONSTITUTION_HASH);
    });
  });

  describe("createLease", () => {
    it("deposits amountPerPeriod * periods USDC into escrow and emits LeaseCreated", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, landlord } = fixture;
      const amountPerPeriod = USDC(500);
      const periods = 12;

      await expect(
        escrow.connect(tenant).createLease(landlord.address, amountPerPeriod, periods, Frequency.Monthly, 0),
      )
        .to.emit(escrow, "LeaseCreated")
        .withArgs(1n, tenant.address, landlord.address, amountPerPeriod, periods, Frequency.Monthly, amountPerPeriod * BigInt(periods), 0n);

      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(amountPerPeriod * BigInt(periods));
    });

    it("deposits amountPerPeriod * periods + cautionAmount USDC when a caution fee is included", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, landlord } = fixture;
      const amountPerPeriod = USDC(500);
      const periods = 12;
      const cautionAmount = USDC(900);
      const rentTotal = amountPerPeriod * BigInt(periods);

      await expect(
        escrow.connect(tenant).createLease(landlord.address, amountPerPeriod, periods, Frequency.Monthly, cautionAmount),
      )
        .to.emit(escrow, "LeaseCreated")
        .withArgs(1n, tenant.address, landlord.address, amountPerPeriod, periods, Frequency.Monthly, rentTotal, cautionAmount);

      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(rentTotal + cautionAmount);
      const lease = await escrow.getLease(1);
      expect(lease.cautionAmount).to.equal(cautionAmount);
    });

    it("reverts on zero landlord address", async () => {
      const { escrow, tenant } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(tenant).createLease(ethers.ZeroAddress, USDC(100), 1, Frequency.Monthly, 0),
      ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
    });

    it("reverts on zero amountPerPeriod", async () => {
      const { escrow, tenant, landlord } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(tenant).createLease(landlord.address, 0, 1, Frequency.Monthly, 0),
      ).to.be.revertedWithCustomError(escrow, "InvalidAmount");
    });

    it("reverts on zero periods", async () => {
      const { escrow, tenant, landlord } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(tenant).createLease(landlord.address, USDC(100), 0, Frequency.Monthly, 0),
      ).to.be.revertedWithCustomError(escrow, "InvalidPeriods");
    });
  });

  describe("signLease", () => {
    it("lets the landlord sign within the deadline and starts the schedule", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord } = fixture;
      await escrow.connect(tenant).createLease(landlord.address, USDC(100), 3, Frequency.Monthly, 0);

      await expect(escrow.connect(landlord).signLease(1)).to.emit(escrow, "LeaseSigned");
      const lease = await escrow.getLease(1);
      expect(lease.signed).to.equal(true);
      expect(lease.signedAt).to.be.greaterThan(0n);
    });

    it("reverts if called by someone other than the landlord", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord, stranger } = fixture;
      await escrow.connect(tenant).createLease(landlord.address, USDC(100), 3, Frequency.Monthly, 0);

      await expect(escrow.connect(stranger).signLease(1)).to.be.revertedWithCustomError(escrow, "NotLandlord");
    });

    it("reverts on double sign", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord } = fixture;
      await escrow.connect(tenant).createLease(landlord.address, USDC(100), 3, Frequency.Monthly, 0);
      await escrow.connect(landlord).signLease(1);

      await expect(escrow.connect(landlord).signLease(1)).to.be.revertedWithCustomError(escrow, "AlreadySigned");
    });

    it("reverts once the 7-day sign deadline has passed", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord } = fixture;
      await escrow.connect(tenant).createLease(landlord.address, USDC(100), 3, Frequency.Monthly, 0);

      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(escrow.connect(landlord).signLease(1)).to.be.revertedWithCustomError(escrow, "SignDeadlinePassed");
    });
  });

  describe("full lifecycle across all frequencies", () => {
    const cases: { name: string; frequency: number; periods: number; amountPerPeriod: bigint }[] = [
      { name: "Monthly", frequency: Frequency.Monthly, periods: 24, amountPerPeriod: USDC(450) },
      { name: "Quarterly", frequency: Frequency.Quarterly, periods: 4, amountPerPeriod: USDC(1200) },
      { name: "Yearly", frequency: Frequency.Yearly, periods: 2, amountPerPeriod: USDC(5000) },
    ];

    for (const { name, frequency, periods, amountPerPeriod } of cases) {
      it(`releases every period on schedule and completes for ${name} leases`, async () => {
        const fixture = await loadFixture(deployFixture);
        const { escrow, usdc, landlord } = fixture;
        const leaseId = await createSignedLease(fixture, amountPerPeriod, periods, frequency);

        for (let period = 1; period <= periods; period++) {
          await time.increase(INTERVAL_SECONDS[frequency]);

          const balanceBefore = await usdc.balanceOf(landlord.address);
          const tx = escrow.releaseTranche(leaseId);

          if (period === periods) {
            await expect(tx).to.emit(escrow, "LeaseCompleted").withArgs(leaseId);
          } else {
            await expect(tx).to.emit(escrow, "TrancheReleased").withArgs(leaseId, 1n, amountPerPeriod, BigInt(period));
          }

          const balanceAfter = await usdc.balanceOf(landlord.address);
          expect(balanceAfter - balanceBefore).to.equal(amountPerPeriod);
        }

        const lease = await escrow.getLease(leaseId);
        expect(lease.periodsReleased).to.equal(BigInt(periods));

        await expect(escrow.releaseTranche(leaseId)).to.be.revertedWithCustomError(escrow, "LeaseFullyReleased");
      });
    }

    it("reverts with NoPeriodsElapsed if called before an interval has passed", async () => {
      const fixture = await loadFixture(deployFixture);
      const leaseId = await createSignedLease(fixture, USDC(100), 6, Frequency.Monthly);

      await expect(fixture.escrow.releaseTranche(leaseId)).to.be.revertedWithCustomError(
        fixture.escrow,
        "NoPeriodsElapsed",
      );
    });
  });

  describe("multi-period catch-up release", () => {
    it("releases all elapsed periods in a single call when release is late", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, landlord } = fixture;
      const amountPerPeriod = USDC(300);
      const leaseId = await createSignedLease(fixture, amountPerPeriod, 12, Frequency.Monthly);

      // Let 3 monthly periods elapse without ever calling releaseTranche.
      await time.increase(INTERVAL_SECONDS[Frequency.Monthly] * 3);

      const balanceBefore = await usdc.balanceOf(landlord.address);
      await expect(escrow.releaseTranche(leaseId))
        .to.emit(escrow, "TrancheReleased")
        .withArgs(leaseId, 3n, amountPerPeriod * 3n, 3n);
      const balanceAfter = await usdc.balanceOf(landlord.address);

      expect(balanceAfter - balanceBefore).to.equal(amountPerPeriod * 3n);

      const lease = await escrow.getLease(leaseId);
      expect(lease.periodsReleased).to.equal(3n);
    });

    it("caps catch-up release at totalPeriods even if far more time has elapsed", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, landlord } = fixture;
      const amountPerPeriod = USDC(300);
      const periods = 6;
      const leaseId = await createSignedLease(fixture, amountPerPeriod, periods, Frequency.Monthly);

      await time.increase(INTERVAL_SECONDS[Frequency.Monthly] * 50);

      await expect(escrow.releaseTranche(leaseId)).to.emit(escrow, "LeaseCompleted").withArgs(leaseId);

      const lease = await escrow.getLease(leaseId);
      expect(lease.periodsReleased).to.equal(BigInt(periods));
      expect(await usdc.balanceOf(landlord.address)).to.equal(amountPerPeriod * BigInt(periods));
    });
  });

  describe("disputes — raising", () => {
    it("blocks releaseTranche while a dispute is active", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);

      await time.increase(INTERVAL_SECONDS[Frequency.Monthly]);
      await expect(escrow.connect(tenant).raiseDispute(leaseId, "Landlord shut off water"))
        .to.emit(escrow, "DisputeRaised")
        .withArgs(leaseId, tenant.address, "Landlord shut off water");

      await expect(escrow.releaseTranche(leaseId)).to.be.revertedWithCustomError(escrow, "DisputeActive");
    });

    it("reverts if raised by someone other than the tenant", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, stranger } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);

      await expect(
        escrow.connect(stranger).raiseDispute(leaseId, "Not my dispute to raise"),
      ).to.be.revertedWithCustomError(escrow, "NotTenant");
    });

    it("reverts if a dispute is already active", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);
      await escrow.connect(tenant).raiseDispute(leaseId, "First dispute");

      await expect(
        escrow.connect(tenant).raiseDispute(leaseId, "Second dispute"),
      ).to.be.revertedWithCustomError(escrow, "DisputeAlreadyActive");
    });
  });

  describe("disputes — Tier 1 direct settlement", () => {
    it("lets either party propose and the other accept a split, executing immediately", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, landlord } = fixture;
      const amountPerPeriod = USDC(400);
      const periods = 6;
      const leaseId = await createSignedLease(fixture, amountPerPeriod, periods, Frequency.Monthly);

      await time.increase(INTERVAL_SECONDS[Frequency.Monthly]);
      await escrow.releaseTranche(leaseId); // 1 released, 5 remaining
      await escrow.connect(tenant).raiseDispute(leaseId, "Broken AC");

      const remaining = amountPerPeriod * BigInt(periods - 1);
      const landlordBps = 3000; // 30% to landlord, 70% refunded to tenant

      await expect(escrow.connect(tenant).proposeSettlement(leaseId, landlordBps))
        .to.emit(escrow, "SettlementProposed")
        .withArgs(leaseId, tenant.address, landlordBps);

      const landlordExpected = (remaining * BigInt(landlordBps)) / BigInt(BPS);
      const tenantExpected = remaining - landlordExpected;

      const landlordBefore = await usdc.balanceOf(landlord.address);
      const tenantBefore = await usdc.balanceOf(tenant.address);

      await expect(escrow.connect(landlord).acceptSettlement(leaseId))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(leaseId, landlordBps, landlordExpected, tenantExpected, ResolutionType.Settlement);

      expect((await usdc.balanceOf(landlord.address)) - landlordBefore).to.equal(landlordExpected);
      expect((await usdc.balanceOf(tenant.address)) - tenantBefore).to.equal(tenantExpected);

      const lease = await escrow.getLease(leaseId);
      expect(lease.disputeActive).to.equal(false);
      expect(lease.periodsReleased).to.equal(BigInt(periods));
    });

    it("reverts if the proposer tries to accept their own proposal", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);
      await escrow.connect(tenant).raiseDispute(leaseId, "Issue");
      await escrow.connect(tenant).proposeSettlement(leaseId, 5000);

      await expect(escrow.connect(tenant).acceptSettlement(leaseId)).to.be.revertedWithCustomError(
        escrow,
        "CannotAcceptOwnProposal",
      );
    });

    it("reverts accepting when there is no proposal", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);
      await escrow.connect(tenant).raiseDispute(leaseId, "Issue");

      await expect(escrow.connect(landlord).acceptSettlement(leaseId)).to.be.revertedWithCustomError(
        escrow,
        "NoSettlementProposal",
      );
    });

    it("reverts proposing or accepting outside the 7-day settlement window", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);
      await escrow.connect(tenant).raiseDispute(leaseId, "Issue");

      await time.increase(SETTLEMENT_WINDOW + 1);

      await expect(escrow.connect(tenant).proposeSettlement(leaseId, 5000)).to.be.revertedWithCustomError(
        escrow,
        "SettlementWindowClosed",
      );
    });

    it("reverts proposing from a non-party address", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, stranger } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);
      await escrow.connect(tenant).raiseDispute(leaseId, "Issue");

      await expect(escrow.connect(stranger).proposeSettlement(leaseId, 5000)).to.be.revertedWithCustomError(
        escrow,
        "NotParty",
      );
    });

    it("reverts an invalid bps value above 10_000", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);
      await escrow.connect(tenant).raiseDispute(leaseId, "Issue");

      await expect(escrow.connect(tenant).proposeSettlement(leaseId, 10_001)).to.be.revertedWithCustomError(
        escrow,
        "InvalidBps",
      );
    });
  });

  describe("disputes — Tier 2 arbitration", () => {
    it("reverts if the arbiter tries to resolve before the settlement window closes", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, arbiter } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);
      await escrow.connect(tenant).raiseDispute(leaseId, "Issue");

      await expect(escrow.connect(arbiter).resolveDispute(leaseId, 10_000)).to.be.revertedWithCustomError(
        escrow,
        "SettlementWindowNotClosed",
      );
    });

    it("landlordBps = 10_000 reproduces the old releaseToLandlord=true behavior exactly (regression check)", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, landlord, arbiter } = fixture;
      const amountPerPeriod = USDC(400);
      const leaseId = await createSignedLease(fixture, amountPerPeriod, 6, Frequency.Monthly);

      await time.increase(INTERVAL_SECONDS[Frequency.Monthly]);
      await escrow.connect(tenant).raiseDispute(leaseId, "Disagreement, later resolved");
      await time.increase(SETTLEMENT_WINDOW + 1);

      await expect(escrow.connect(arbiter).resolveDispute(leaseId, 10_000))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(leaseId, 10_000, 0n, 0n, ResolutionType.Arbitration);

      const lease = await escrow.getLease(leaseId);
      expect(lease.disputeActive).to.equal(false);
      expect(lease.periodsReleased).to.equal(0n); // nothing distributed now — schedule resumes

      const balanceBefore = await usdc.balanceOf(landlord.address);
      await escrow.releaseTranche(leaseId);
      const balanceAfter = await usdc.balanceOf(landlord.address);
      expect(balanceAfter - balanceBefore).to.equal(amountPerPeriod);
    });

    it("landlordBps = 0 reproduces the old releaseToLandlord=false behavior exactly (regression check)", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, arbiter } = fixture;
      const amountPerPeriod = USDC(400);
      const periods = 6;
      const leaseId = await createSignedLease(fixture, amountPerPeriod, periods, Frequency.Monthly);

      await time.increase(INTERVAL_SECONDS[Frequency.Monthly]);
      await escrow.releaseTranche(leaseId); // 1 released, 5 remaining
      await escrow.connect(tenant).raiseDispute(leaseId, "Breach of contract");
      await time.increase(SETTLEMENT_WINDOW + 1);

      const tenantBalanceBefore = await usdc.balanceOf(tenant.address);
      const remaining = amountPerPeriod * BigInt(periods - 1);

      await expect(escrow.connect(arbiter).resolveDispute(leaseId, 0))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(leaseId, 0, 0n, remaining, ResolutionType.Arbitration);

      const tenantBalanceAfter = await usdc.balanceOf(tenant.address);
      expect(tenantBalanceAfter - tenantBalanceBefore).to.equal(remaining);

      const lease = await escrow.getLease(leaseId);
      expect(lease.periodsReleased).to.equal(BigInt(periods));
      expect(lease.disputeActive).to.equal(false);

      await expect(escrow.releaseTranche(leaseId)).to.be.revertedWithCustomError(escrow, "LeaseFullyReleased");
    });

    it("splits a partial ratio correctly between landlord and tenant", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, landlord, arbiter } = fixture;
      const amountPerPeriod = USDC(1000);
      const periods = 4;
      const leaseId = await createSignedLease(fixture, amountPerPeriod, periods, Frequency.Monthly);

      await escrow.connect(tenant).raiseDispute(leaseId, "Partial breach");
      await time.increase(SETTLEMENT_WINDOW + 1);

      const remaining = amountPerPeriod * BigInt(periods);
      const landlordBps = 6500; // 65/35 split

      const landlordBefore = await usdc.balanceOf(landlord.address);
      const tenantBefore = await usdc.balanceOf(tenant.address);

      await escrow.connect(arbiter).resolveDispute(leaseId, landlordBps);

      const landlordExpected = (remaining * BigInt(landlordBps)) / BigInt(BPS);
      const tenantExpected = remaining - landlordExpected;

      expect((await usdc.balanceOf(landlord.address)) - landlordBefore).to.equal(landlordExpected);
      expect((await usdc.balanceOf(tenant.address)) - tenantBefore).to.equal(tenantExpected);
    });

    it("reverts resolveDispute if called by someone other than the arbiter", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, stranger } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);
      await escrow.connect(tenant).raiseDispute(leaseId, "Breach");
      await time.increase(SETTLEMENT_WINDOW + 1);

      await expect(escrow.connect(stranger).resolveDispute(leaseId, 10_000)).to.be.revertedWithCustomError(
        escrow,
        "NotArbiter",
      );
    });

    it("reverts resolveDispute if there is no active dispute", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, arbiter } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);

      await expect(escrow.connect(arbiter).resolveDispute(leaseId, 10_000)).to.be.revertedWithCustomError(
        escrow,
        "DisputeNotActive",
      );
    });
  });

  describe("disputes — auto-fallback", () => {
    it("reverts if the arbitration window hasn't elapsed yet", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, stranger } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);
      await escrow.connect(tenant).raiseDispute(leaseId, "Issue");
      await time.increase(SETTLEMENT_WINDOW + 1);

      await expect(escrow.connect(stranger).autoResolveOverdueDispute(leaseId)).to.be.revertedWithCustomError(
        escrow,
        "ArbitrationWindowNotElapsed",
      );
    });

    it("lets anyone auto-resolve to the landlord once the arbitration window elapses", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, landlord, stranger } = fixture;
      const amountPerPeriod = USDC(500);
      const leaseId = await createSignedLease(fixture, amountPerPeriod, 6, Frequency.Monthly);
      await escrow.connect(tenant).raiseDispute(leaseId, "Issue never ruled on");

      await time.increase(SETTLEMENT_WINDOW + ARBITRATION_WINDOW + 1);

      await expect(escrow.connect(stranger).autoResolveOverdueDispute(leaseId))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(leaseId, 10_000, 0n, 0n, ResolutionType.AutoFallback);

      const lease = await escrow.getLease(leaseId);
      expect(lease.disputeActive).to.equal(false);
      expect(lease.periodsReleased).to.equal(0n);

      await time.increase(INTERVAL_SECONDS[Frequency.Monthly]);

      const balanceBefore = await usdc.balanceOf(landlord.address);
      await escrow.releaseTranche(leaseId);
      expect((await usdc.balanceOf(landlord.address)) - balanceBefore).to.equal(amountPerPeriod);
    });

    it("reverts auto-resolve if there is no active dispute", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, stranger } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);

      await expect(escrow.connect(stranger).autoResolveOverdueDispute(leaseId)).to.be.revertedWithCustomError(
        escrow,
        "DisputeNotActive",
      );
    });
  });

  describe("cancelUnsigned", () => {
    it("refunds the tenant in full if the landlord never signs within 7 days", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, landlord } = fixture;
      const amountPerPeriod = USDC(600);
      const periods = 12;
      const total = amountPerPeriod * BigInt(periods);

      await escrow.connect(tenant).createLease(landlord.address, amountPerPeriod, periods, Frequency.Monthly, 0);

      await time.increase(7 * 24 * 60 * 60 + 1);

      const tenantBalanceBefore = await usdc.balanceOf(tenant.address);
      await expect(escrow.connect(tenant).cancelUnsigned(1))
        .to.emit(escrow, "LeaseCancelled")
        .withArgs(1, total);
      const tenantBalanceAfter = await usdc.balanceOf(tenant.address);

      expect(tenantBalanceAfter - tenantBalanceBefore).to.equal(total);
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(0n);

      const lease = await escrow.getLease(1);
      expect(lease.cancelled).to.equal(true);
    });

    it("also refunds the caution fee if one was included", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, landlord } = fixture;
      const amountPerPeriod = USDC(600);
      const periods = 12;
      const cautionAmount = USDC(1200);
      const total = amountPerPeriod * BigInt(periods) + cautionAmount;

      await escrow.connect(tenant).createLease(landlord.address, amountPerPeriod, periods, Frequency.Monthly, cautionAmount);
      await time.increase(7 * 24 * 60 * 60 + 1);

      const tenantBalanceBefore = await usdc.balanceOf(tenant.address);
      await expect(escrow.connect(tenant).cancelUnsigned(1))
        .to.emit(escrow, "LeaseCancelled")
        .withArgs(1, total);
      const tenantBalanceAfter = await usdc.balanceOf(tenant.address);

      expect(tenantBalanceAfter - tenantBalanceBefore).to.equal(total);
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(0n);
    });

    it("reverts before the 7-day deadline has passed", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord } = fixture;
      await escrow.connect(tenant).createLease(landlord.address, USDC(100), 3, Frequency.Monthly, 0);

      await expect(escrow.connect(tenant).cancelUnsigned(1)).to.be.revertedWithCustomError(
        escrow,
        "SignDeadlineNotPassed",
      );
    });

    it("reverts if the lease was already signed", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord } = fixture;
      await escrow.connect(tenant).createLease(landlord.address, USDC(100), 3, Frequency.Monthly, 0);
      await escrow.connect(landlord).signLease(1);

      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(escrow.connect(tenant).cancelUnsigned(1)).to.be.revertedWithCustomError(escrow, "AlreadySigned");
    });

    it("reverts if called by someone other than the tenant", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord, stranger } = fixture;
      await escrow.connect(tenant).createLease(landlord.address, USDC(100), 3, Frequency.Monthly, 0);

      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(escrow.connect(stranger).cancelUnsigned(1)).to.be.revertedWithCustomError(escrow, "NotTenant");
    });
  });

  describe("caution fee", () => {
    const EVIDENCE_HASH = ethers.keccak256(ethers.toUtf8Bytes("itemized-claim-v1"));

    async function createCompletedLeaseWithCaution(
      fixture: Awaited<ReturnType<typeof deployFixture>>,
      amountPerPeriod: bigint,
      periods: number,
      cautionAmount: bigint,
    ) {
      const leaseId = await createSignedLease(fixture, amountPerPeriod, periods, Frequency.Monthly, cautionAmount);
      await time.increase(INTERVAL_SECONDS[Frequency.Monthly] * periods);
      await fixture.escrow.releaseTranche(leaseId);
      return leaseId;
    }

    it("auto-releases the full caution fee to the tenant if no claim is filed within 7 days", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, stranger } = fixture;
      const cautionAmount = USDC(600);
      const leaseId = await createCompletedLeaseWithCaution(fixture, USDC(400), 3, cautionAmount);

      await expect(escrow.connect(stranger).releaseCaution(leaseId)).to.be.revertedWithCustomError(
        escrow,
        "ClaimWindowNotElapsed",
      );

      await time.increase(CAUTION_CLAIM_WINDOW + 1);

      const tenantBefore = await usdc.balanceOf(tenant.address);
      await expect(escrow.connect(stranger).releaseCaution(leaseId))
        .to.emit(escrow, "CautionReleased")
        .withArgs(leaseId, cautionAmount);
      const tenantAfter = await usdc.balanceOf(tenant.address);

      expect(tenantAfter - tenantBefore).to.equal(cautionAmount);

      const lease = await escrow.getLease(leaseId);
      expect(lease.cautionSettled).to.equal(true);

      await expect(escrow.releaseCaution(leaseId)).to.be.revertedWithCustomError(escrow, "CautionAlreadySettled");
    });

    it("releases the undisputed remainder immediately when a partial claim is filed", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, landlord } = fixture;
      const cautionAmount = USDC(1000);
      const claimAmount = USDC(300);
      const leaseId = await createCompletedLeaseWithCaution(fixture, USDC(400), 3, cautionAmount);

      const tenantBefore = await usdc.balanceOf(tenant.address);
      await expect(escrow.connect(landlord).fileDepositClaim(leaseId, claimAmount, EVIDENCE_HASH))
        .to.emit(escrow, "DepositClaimFiled")
        .withArgs(leaseId, claimAmount, EVIDENCE_HASH, cautionAmount - claimAmount);
      const tenantAfter = await usdc.balanceOf(tenant.address);

      expect(tenantAfter - tenantBefore).to.equal(cautionAmount - claimAmount);

      const lease = await escrow.getLease(leaseId);
      expect(lease.disputeActive).to.equal(true);
      expect(lease.cautionClaimedAmount).to.equal(claimAmount);
      expect(lease.cautionSettled).to.equal(false);
    });

    it("resolves a filed claim through the same settlement/arbitration path as a rent dispute", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, landlord, arbiter } = fixture;
      const cautionAmount = USDC(1000);
      const claimAmount = USDC(400);
      const leaseId = await createCompletedLeaseWithCaution(fixture, USDC(400), 3, cautionAmount);

      await escrow.connect(landlord).fileDepositClaim(leaseId, claimAmount, EVIDENCE_HASH);
      await time.increase(SETTLEMENT_WINDOW + 1);

      const landlordBps = 5000; // 50/50 split of the claimed portion
      const landlordExpected = (claimAmount * BigInt(landlordBps)) / BigInt(BPS);
      const tenantExpected = claimAmount - landlordExpected;

      const landlordBefore = await usdc.balanceOf(landlord.address);
      const tenantBefore = await usdc.balanceOf(tenant.address);

      await expect(escrow.connect(arbiter).resolveDispute(leaseId, landlordBps))
        .to.emit(escrow, "CautionClaimResolved")
        .withArgs(leaseId, landlordBps, landlordExpected, tenantExpected, ResolutionType.Arbitration);

      expect((await usdc.balanceOf(landlord.address)) - landlordBefore).to.equal(landlordExpected);
      expect((await usdc.balanceOf(tenant.address)) - tenantBefore).to.equal(tenantExpected);

      const lease = await escrow.getLease(leaseId);
      expect(lease.disputeActive).to.equal(false);
      expect(lease.cautionSettled).to.equal(true);
    });

    it("a full claim (claimAmount == cautionAmount) releases nothing upfront and disputes the whole amount", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, usdc, tenant, landlord } = fixture;
      const cautionAmount = USDC(500);
      const leaseId = await createCompletedLeaseWithCaution(fixture, USDC(400), 3, cautionAmount);

      const tenantBefore = await usdc.balanceOf(tenant.address);
      await expect(escrow.connect(landlord).fileDepositClaim(leaseId, cautionAmount, EVIDENCE_HASH))
        .to.emit(escrow, "DepositClaimFiled")
        .withArgs(leaseId, cautionAmount, EVIDENCE_HASH, 0n);
      const tenantAfter = await usdc.balanceOf(tenant.address);

      expect(tenantAfter - tenantBefore).to.equal(0n);

      const lease = await escrow.getLease(leaseId);
      expect(lease.cautionClaimedAmount).to.equal(cautionAmount);
    });

    it("reverts a claim filed after the 7-day claim window", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, landlord } = fixture;
      const cautionAmount = USDC(500);
      const leaseId = await createCompletedLeaseWithCaution(fixture, USDC(400), 3, cautionAmount);

      await time.increase(CAUTION_CLAIM_WINDOW + 1);

      await expect(
        escrow.connect(landlord).fileDepositClaim(leaseId, USDC(100), EVIDENCE_HASH),
      ).to.be.revertedWithCustomError(escrow, "ClaimWindowClosed");
    });

    it("reverts a claim filed by a non-landlord", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, stranger } = fixture;
      const cautionAmount = USDC(500);
      const leaseId = await createCompletedLeaseWithCaution(fixture, USDC(400), 3, cautionAmount);

      await expect(
        escrow.connect(stranger).fileDepositClaim(leaseId, USDC(100), EVIDENCE_HASH),
      ).to.be.revertedWithCustomError(escrow, "NotLandlord");
    });

    it("reverts a claim with no evidence hash", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, landlord } = fixture;
      const cautionAmount = USDC(500);
      const leaseId = await createCompletedLeaseWithCaution(fixture, USDC(400), 3, cautionAmount);

      await expect(
        escrow.connect(landlord).fileDepositClaim(leaseId, USDC(100), ethers.ZeroHash),
      ).to.be.revertedWithCustomError(escrow, "NoEvidence");
    });

    it("reverts a claim exceeding the caution amount", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, landlord } = fixture;
      const cautionAmount = USDC(500);
      const leaseId = await createCompletedLeaseWithCaution(fixture, USDC(400), 3, cautionAmount);

      await expect(
        escrow.connect(landlord).fileDepositClaim(leaseId, USDC(600), EVIDENCE_HASH),
      ).to.be.revertedWithCustomError(escrow, "InvalidClaimAmount");
    });

    it("reverts filing a second claim", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, landlord } = fixture;
      const cautionAmount = USDC(500);
      const leaseId = await createCompletedLeaseWithCaution(fixture, USDC(400), 3, cautionAmount);

      await escrow.connect(landlord).fileDepositClaim(leaseId, USDC(100), EVIDENCE_HASH);
      await expect(
        escrow.connect(landlord).fileDepositClaim(leaseId, USDC(50), EVIDENCE_HASH),
      ).to.be.revertedWithCustomError(escrow, "ClaimAlreadyFiled");
    });

    it("reverts filing or releasing a claim before the lease has completed", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord } = fixture;
      const cautionAmount = USDC(500);
      const leaseId = await createSignedLease(fixture, USDC(400), 3, Frequency.Monthly, cautionAmount);

      await expect(
        escrow.connect(landlord).fileDepositClaim(leaseId, USDC(100), EVIDENCE_HASH),
      ).to.be.revertedWithCustomError(escrow, "LeaseNotComplete");
      await expect(escrow.releaseCaution(leaseId)).to.be.revertedWithCustomError(escrow, "LeaseNotComplete");
    });

    it("reverts fileDepositClaim/releaseCaution on a lease with no caution fee", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, landlord } = fixture;
      const leaseId = await createCompletedLeaseWithCaution(fixture, USDC(400), 3, 0n);

      await expect(
        escrow.connect(landlord).fileDepositClaim(leaseId, USDC(100), EVIDENCE_HASH),
      ).to.be.revertedWithCustomError(escrow, "NoCautionFee");
      await expect(escrow.releaseCaution(leaseId)).to.be.revertedWithCustomError(escrow, "NoCautionFee");
    });

    it("a rent dispute resolved via a partial split still marks completedAt so the caution flow works", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord, arbiter, usdc } = fixture;
      const amountPerPeriod = USDC(400);
      const periods = 6;
      const cautionAmount = USDC(500);
      const leaseId = await createSignedLease(fixture, amountPerPeriod, periods, Frequency.Monthly, cautionAmount);

      await escrow.connect(tenant).raiseDispute(leaseId, "Breach");
      await time.increase(SETTLEMENT_WINDOW + 1);
      await escrow.connect(arbiter).resolveDispute(leaseId, 5000); // concludes the lease via a partial split

      const lease = await escrow.getLease(leaseId);
      expect(lease.completedAt).to.be.greaterThan(0n);

      await time.increase(CAUTION_CLAIM_WINDOW + 1);
      const tenantBefore = await usdc.balanceOf(tenant.address);
      await escrow.releaseCaution(leaseId);
      expect((await usdc.balanceOf(tenant.address)) - tenantBefore).to.equal(cautionAmount);
    });
  });

  describe("tenancy credential", () => {
    async function deployCredentialFixture() {
      const [escrowSigner, tenant, stranger] = await ethers.getSigners();
      const CredentialFactory = await ethers.getContractFactory("TenancyCredential");
      const credential = (await CredentialFactory.deploy(escrowSigner.address)) as unknown as TenancyCredential;
      await credential.waitForDeployment();
      return { escrowSigner, tenant, stranger, credential };
    }

    const sampleData = (leaseId: bigint) => ({
      leaseId,
      durationDays: 180n,
      totalPeriods: 6n,
      onTimePeriods: 6n,
      disputesLost: 0n,
      completionDate: 1_700_000_000n,
    });

    it("only the escrow address can mint", async () => {
      const { escrowSigner, tenant, stranger, credential } = await loadFixture(deployCredentialFixture);

      await expect(
        credential.connect(stranger).mintForLease(tenant.address, sampleData(1n)),
      ).to.be.revertedWithCustomError(credential, "NotEscrow");

      await expect(credential.connect(escrowSigner).mintForLease(tenant.address, sampleData(1n))).to.emit(
        credential,
        "Transfer",
      );
      expect(await credential.ownerOf(1n)).to.equal(tenant.address);
    });

    it("reverts a second mint attempt for the same lease", async () => {
      const { escrowSigner, tenant, credential } = await loadFixture(deployCredentialFixture);
      await credential.connect(escrowSigner).mintForLease(tenant.address, sampleData(1n));

      await expect(
        credential.connect(escrowSigner).mintForLease(tenant.address, sampleData(1n)),
      ).to.be.revertedWithCustomError(credential, "AlreadyMinted");
    });

    it("reverts every transfer path with NonTransferable — soulbound", async () => {
      const { escrowSigner, tenant, stranger, credential } = await loadFixture(deployCredentialFixture);
      await credential.connect(escrowSigner).mintForLease(tenant.address, sampleData(1n));

      await expect(
        credential.connect(tenant).transferFrom(tenant.address, stranger.address, 1n),
      ).to.be.revertedWithCustomError(credential, "NonTransferable");
      await expect(
        credential.connect(tenant)["safeTransferFrom(address,address,uint256)"](tenant.address, stranger.address, 1n),
      ).to.be.revertedWithCustomError(credential, "NonTransferable");
      await expect(
        credential
          .connect(tenant)
          ["safeTransferFrom(address,address,uint256,bytes)"](tenant.address, stranger.address, 1n, "0x"),
      ).to.be.revertedWithCustomError(credential, "NonTransferable");
      await expect(credential.connect(tenant).approve(stranger.address, 1n)).to.be.revertedWithCustomError(
        credential,
        "NonTransferable",
      );
      await expect(credential.connect(tenant).setApprovalForAll(stranger.address, true)).to.be.revertedWithCustomError(
        credential,
        "NonTransferable",
      );

      expect(await credential.ownerOf(1n)).to.equal(tenant.address);
    });

    it("mints exactly once, automatically, on a lease's full natural completion", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, credential, tenant } = fixture;
      const periods = 3;
      const leaseId = await createSignedLease(fixture, USDC(400), periods, Frequency.Monthly);

      // Release one period at a time, on schedule, so all three land as "on time"
      // under the latePeriods proxy (only catch-ups beyond the first count late).
      await time.increase(INTERVAL_SECONDS[Frequency.Monthly]);
      await escrow.releaseTranche(leaseId);
      await time.increase(INTERVAL_SECONDS[Frequency.Monthly]);
      await expect(escrow.releaseTranche(leaseId)).to.not.emit(credential, "Transfer");
      await time.increase(INTERVAL_SECONDS[Frequency.Monthly]);
      await expect(escrow.releaseTranche(leaseId)).to.emit(credential, "Transfer").withArgs(ethers.ZeroAddress, tenant.address, 1n);

      expect(await credential.balanceOf(tenant.address)).to.equal(1n);
      expect(await credential.ownerOf(1n)).to.equal(tenant.address);
      const data = await credential.credentialData(1n);
      expect(data.leaseId).to.equal(leaseId);
      expect(data.totalPeriods).to.equal(BigInt(periods));
      expect(data.onTimePeriods).to.equal(BigInt(periods));
      expect(data.disputesLost).to.equal(0n);

      const lease = await escrow.getLease(leaseId);
      expect(lease.credentialTokenId).to.equal(1n);

      // Idempotent — nothing left to trigger a second attempt, but confirm state reflects one mint only.
      expect(await credential.tokenIdForLease(leaseId)).to.equal(1n);
    });

    it("waits for the caution fee to settle before minting when one is included", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, credential, tenant } = fixture;
      const periods = 3;
      const cautionAmount = USDC(300);
      const leaseId = await createSignedLease(fixture, USDC(400), periods, Frequency.Monthly, cautionAmount);

      await time.increase(INTERVAL_SECONDS[Frequency.Monthly] * periods);
      await escrow.releaseTranche(leaseId); // rent side completes naturally — no mint yet, caution unsettled
      expect(await credential.balanceOf(tenant.address)).to.equal(0n);

      await time.increase(CAUTION_CLAIM_WINDOW + 1);
      await expect(escrow.releaseCaution(leaseId)).to.emit(credential, "Transfer").withArgs(ethers.ZeroAddress, tenant.address, 1n);
      expect(await credential.balanceOf(tenant.address)).to.equal(1n);
    });

    it("mints after a caution claim resolves, even though the tenant lost part of it", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, credential, tenant, landlord, arbiter } = fixture;
      const periods = 3;
      const cautionAmount = USDC(300);
      const leaseId = await createSignedLease(fixture, USDC(400), periods, Frequency.Monthly, cautionAmount);

      await time.increase(INTERVAL_SECONDS[Frequency.Monthly] * periods);
      await escrow.releaseTranche(leaseId);

      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("claim"));
      await escrow.connect(landlord).fileDepositClaim(leaseId, USDC(100), evidenceHash);
      await time.increase(SETTLEMENT_WINDOW + 1);
      await escrow.connect(arbiter).resolveDispute(leaseId, 8000); // mostly upheld against the tenant

      expect(await credential.balanceOf(tenant.address)).to.equal(1n);
      const data = await credential.credentialData(1n);
      expect(data.disputesLost).to.equal(1n); // an honest fact on the credential, not a disqualifier
    });

    it("never mints for a cancelled (unsigned) lease", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord, credential } = fixture;
      await escrow.connect(tenant).createLease(landlord.address, USDC(400), 3, Frequency.Monthly, 0);
      await time.increase(7 * 24 * 60 * 60 + 1);
      await escrow.connect(tenant).cancelUnsigned(1);

      expect(await credential.balanceOf(tenant.address)).to.equal(0n);
    });

    it("never mints for a lease terminated early by a dispute resolution, even if it later would have had time to complete", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, arbiter, credential } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(400), 6, Frequency.Monthly);

      await escrow.connect(tenant).raiseDispute(leaseId, "Uninhabitable");
      await time.increase(SETTLEMENT_WINDOW + 1);
      await escrow.connect(arbiter).resolveDispute(leaseId, 0); // full refund to tenant — concludes the lease early

      const lease = await escrow.getLease(leaseId);
      expect(lease.completedNaturally).to.equal(false);
      expect(lease.periodsReleased).to.equal(lease.totalPeriods); // "complete" in the state-machine sense

      // Even letting all the time in the world pass, nothing ever mints — there is no
      // further releaseTranche/releaseCaution/claim-resolution call that could trigger it.
      await time.increase(365 * 24 * 60 * 60);
      expect(await credential.balanceOf(tenant.address)).to.equal(0n);
    });

    it("never mints for a lease the arbiter ruled fully against the tenant mid-term (severe breach)", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord, arbiter, credential } = fixture;
      const leaseId = await createSignedLease(fixture, USDC(500), 8, Frequency.Monthly);

      await time.increase(INTERVAL_SECONDS[Frequency.Monthly]);
      await escrow.releaseTranche(leaseId);
      await escrow.connect(tenant).raiseDispute(leaseId, "Dispute later ruled against the tenant");
      await time.increase(SETTLEMENT_WINDOW + 1);
      await escrow.connect(arbiter).resolveDispute(leaseId, 6500); // partial split, still an early conclusion

      const lease = await escrow.getLease(leaseId);
      expect(lease.completedNaturally).to.equal(false);
      expect(await credential.balanceOf(tenant.address)).to.equal(0n);
      void landlord;
    });

    it("does not block normal lease operation when no credential contract has been wired", async () => {
      const [deployer, tenant, landlord, arbiter] = await ethers.getSigners();
      const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
      const usdc = (await MockUSDCFactory.deploy()) as unknown as MockUSDC;
      await usdc.waitForDeployment();
      const EscrowFactory = await ethers.getContractFactory("RentPactEscrow");
      const escrow = (await EscrowFactory.deploy(
        await usdc.getAddress(),
        arbiter.address,
        CONSTITUTION_HASH,
      )) as unknown as RentPactEscrow;
      await escrow.waitForDeployment();
      await usdc.mint(tenant.address, USDC(1_000_000));
      await usdc.connect(tenant).approve(await escrow.getAddress(), ethers.MaxUint256);
      void deployer;

      const tx = await escrow.connect(tenant).createLease(landlord.address, USDC(400), 2, Frequency.Monthly, 0);
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => {
          try {
            return escrow.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e?.name === "LeaseCreated");
      const leaseId = event!.args.leaseId as bigint;
      await escrow.connect(landlord).signLease(leaseId);

      await time.increase(INTERVAL_SECONDS[Frequency.Monthly] * 2);
      await expect(escrow.releaseTranche(leaseId)).to.emit(escrow, "LeaseCompleted");
    });
  });

  describe("intervalSeconds", () => {
    it("returns the correct interval for each frequency", async () => {
      const { escrow } = await loadFixture(deployFixture);
      expect(await escrow.intervalSeconds(Frequency.Monthly)).to.equal(30 * 24 * 60 * 60);
      expect(await escrow.intervalSeconds(Frequency.Quarterly)).to.equal(90 * 24 * 60 * 60);
      expect(await escrow.intervalSeconds(Frequency.Yearly)).to.equal(365 * 24 * 60 * 60);
      expect(await escrow.intervalSeconds(Frequency.Daily)).to.equal(24 * 60 * 60);
      expect(await escrow.intervalSeconds(Frequency.Hourly)).to.equal(60 * 60);
    });
  });

  describe("short-term frequencies (Daily / Hourly)", () => {
    it("runs a full Daily lease lifecycle and mints a credential with the correct duration", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, credential, tenant, landlord } = fixture;
      const amountPerPeriod = USDC(50);
      const periods = 3;
      const leaseId = await createSignedLease(fixture, amountPerPeriod, periods, Frequency.Daily);

      for (let i = 0; i < periods; i++) {
        await time.increase(INTERVAL_SECONDS[Frequency.Daily]);
        await escrow.releaseTranche(leaseId);
      }

      const lease = await escrow.getLease(leaseId);
      expect(lease.periodsReleased).to.equal(BigInt(periods));
      expect(lease.frequency).to.equal(Frequency.Daily);

      const data = await credential.credentialData(1n);
      expect(data.durationDays).to.equal(3n);
      void landlord;
    });

    it("runs a full Hourly lease lifecycle, correctly accruing sub-day duration", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, credential, tenant } = fixture;
      const amountPerPeriod = USDC(5);
      const periods = 6;
      const leaseId = await createSignedLease(fixture, amountPerPeriod, periods, Frequency.Hourly);

      for (let i = 0; i < periods; i++) {
        await time.increase(INTERVAL_SECONDS[Frequency.Hourly]);
        await escrow.releaseTranche(leaseId);
      }

      expect(await credential.balanceOf(tenant.address)).to.equal(1n);
      const data = await credential.credentialData(1n);
      // 6 hours total — under a full day, so durationDays truncates to 0.
      expect(data.durationDays).to.equal(0n);
      expect(data.totalPeriods).to.equal(6n);
    });

    it("still applies the fixed multi-day SIGN_DEADLINE and dispute windows to short-term leases (accepted mismatch)", async () => {
      const fixture = await loadFixture(deployFixture);
      const { escrow, tenant, landlord } = fixture;
      const tx = await escrow.connect(tenant).createLease(landlord.address, USDC(20), 4, Frequency.Hourly, 0);
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((log) => {
          try {
            return escrow.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e?.name === "LeaseCreated");
      const leaseId = event!.args.leaseId as bigint;

      // The whole 4-hour stay could pass and the sign deadline (7 days) is nowhere close.
      await time.increase(4 * 60 * 60);
      await expect(escrow.connect(landlord).signLease(leaseId)).to.not.be.reverted;
    });
  });
});

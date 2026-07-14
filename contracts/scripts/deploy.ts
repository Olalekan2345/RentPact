import { ethers } from "hardhat";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";

/// Deploys RentPactEscrow to whatever network Hardhat is pointed at.
/// Required env (see ../.env.example):
///   NEXT_PUBLIC_USDC_CONTRACT_ADDRESS — escrow token (native USDC on Arc testnet)
///   ARC_ARBITER_ADDRESS               — address authorized to resolve disputes
///   ARC_DEPLOYER_PRIVATE_KEY          — funds gas and signs the deploy tx
///
/// constitutionHash is computed directly from the same file the app hashes at
/// runtime (../public/legal/constitution-v1.md) — never passed by hand, so the
/// deployed contract can never record a hash that doesn't match the published
/// document.
function computeConstitutionHash(): string {
  const filePath = path.resolve(__dirname, "../../public/legal/constitution-v1.md");
  const text = readFileSync(filePath, "utf-8");
  return "0x" + createHash("sha256").update(text, "utf-8").digest("hex");
}

async function main() {
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS;
  const arbiterAddress = process.env.ARC_ARBITER_ADDRESS;

  if (!usdcAddress) {
    throw new Error("Missing NEXT_PUBLIC_USDC_CONTRACT_ADDRESS in .env / .env.local");
  }
  if (!arbiterAddress) {
    throw new Error(
      "Missing ARC_ARBITER_ADDRESS in .env / .env.local — set the address authorized to resolve disputes",
    );
  }

  const constitutionHash = computeConstitutionHash();

  const [deployer] = await ethers.getSigners();
  console.log("Deploying RentPactEscrow with account:", deployer.address);
  console.log("USDC token:", usdcAddress);
  console.log("Arbiter:", arbiterAddress);
  console.log("Constitution hash:", constitutionHash);

  const EscrowFactory = await ethers.getContractFactory("RentPactEscrow");
  const escrow = await EscrowFactory.deploy(usdcAddress, arbiterAddress, constitutionHash);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  const deployTx = escrow.deploymentTransaction();
  const receipt = deployTx ? await deployTx.wait() : null;

  console.log("RentPactEscrow deployed to:", address);

  // TenancyCredential needs escrow's address at its own deploy time (onlyEscrow);
  // escrow needs TenancyCredential's address to mint. Escrow deploys first, then
  // TenancyCredential is deployed against its now-known address, then a one-time
  // setCredentialContract() call (deployer-only, permanently locked after) wires
  // escrow to it. See RentPactEscrow's NatSpec on `credentialContract`.
  const CredentialFactory = await ethers.getContractFactory("TenancyCredential");
  const credential = await CredentialFactory.deploy(address);
  await credential.waitForDeployment();
  const credentialAddress = await credential.getAddress();
  console.log("TenancyCredential deployed to:", credentialAddress);

  const setTx = await escrow.setCredentialContract(credentialAddress);
  await setTx.wait();
  console.log("RentPactEscrow wired to TenancyCredential.");

  console.log("\nAdd these to your .env.local:");
  console.log(`NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS=${address}`);
  console.log(`NEXT_PUBLIC_TENANCY_CREDENTIAL_ADDRESS=${credentialAddress}`);
  if (receipt) {
    console.log(`NEXT_PUBLIC_RENTPACT_DEPLOY_BLOCK=${receipt.blockNumber}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

-- Lets the disputes page read resolved-dispute outcomes from activity_events
-- instead of scanning the chain for every lease (same problem as the
-- transaction-history fix in 0006 — getDisputeOverview was the one page
-- still paying for that per-lease scan, since it's the one page that
-- actually renders resolution history).
--
-- landlord_bps: the settlement/arbitration ratio, needed for the outcome
-- badge ("Released to landlord" / "Refunded to tenant" / split %).
-- resolution_type: which path produced the ruling — derived at write time
-- from which function was called (resolveDispute -> arbitration,
-- acceptSettlement -> settlement, autoResolveOverdueDispute -> auto-fallback),
-- not scanned from the chain.

alter table activity_events add column landlord_bps int;
alter table activity_events add column resolution_type text;

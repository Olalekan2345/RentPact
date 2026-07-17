"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { EscrowTimeline, type EscrowTimelineNodeData } from "@/components/escrow";
import { Button, Card, CardContent, Input, SegmentedControl } from "@/components/ui";
import { CurrencyEquivalent } from "@/components/CurrencyEquivalent";
import { useCautionFeeLabel, suggestedCautionRange, isCautionFeeHigh } from "@/lib/cautionFee";
import { FREQUENCY_OPTIONS, INTERVAL_DAYS } from "@/lib/contracts/frequency";
import { UsdcAmount } from "@/components/UsdcAmount";
import { createListing } from "@/lib/listings";
import { fetchTemplates, saveTemplate, type LeaseTemplate } from "@/lib/templates";
import { resizeImageToDataUrl, uploadDataUrl, uploadImage, uploadFile } from "@/lib/image";
import {
  CONDITION_AREAS,
  CONDITION_STATUS_OPTIONS,
  RESPONSIBILITY_OPTIONS,
  DEFAULT_MAINTENANCE_LANDLORD,
  DEFAULT_MAINTENANCE_TENANT,
  emptyConditionAreas,
  hashDeclaration,
  sha256Hex,
  type ConditionAreaKey,
  type ConditionDeclaration,
  type ConditionStatus,
  type Responsibility,
  type RoomPhoto,
} from "@/lib/condition";
import type { ReleaseFrequency } from "@/components/escrow";

const PROPERTY_TYPES: { value: string; label: string }[] = [
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "duplex", label: "Duplex" },
  { value: "bungalow", label: "Bungalow" },
  { value: "self-contain", label: "Self-contain" },
  { value: "condo", label: "Condo" },
  { value: "office", label: "Office" },
  { value: "other", label: "Other" },
];

const NOTICE_PERIOD_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
];

const STEPS = ["Property", "Terms", "Rules", "Condition", "Review"] as const;

const propertyStepSchema = z.object({
  propertyAddress: z.string().min(5, "Enter the full property address"),
  propertyType: z.string().min(1),
  photoUrl: z.union([z.string().url(), z.literal("")]),
});

const termsStepSchema = z.object({
  amountPerPeriod: z.coerce.number().positive("Enter an amount greater than zero"),
  totalPeriods: z.coerce.number().int().positive("Enter at least 1 period"),
  frequency: z.enum(["monthly", "quarterly", "yearly", "daily", "hourly"]),
});

const FREQUENCY_UNIT_LABEL: Record<ReleaseFrequency, string> = {
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
  daily: "day",
  hourly: "hour",
};

export default function NewListingPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(0);

  // Property details
  const [propertyAddress, setPropertyAddress] = useState("");
  const [propertyType, setPropertyType] = useState("apartment");
  const [photoUrl, setPhotoUrl] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [amenityInput, setAmenityInput] = useState("");
  const [uploadingCoverPhoto, setUploadingCoverPhoto] = useState(false);
  const [coverPhotoError, setCoverPhotoError] = useState<string | null>(null);

  // Terms
  const [amountPerPeriod, setAmountPerPeriod] = useState("");
  const [totalPeriods, setTotalPeriods] = useState("12");
  const [frequency, setFrequency] = useState<ReleaseFrequency>("monthly");
  const [includeSecurityDeposit, setIncludeSecurityDeposit] = useState(false);
  const [securityDepositAmount, setSecurityDepositAmount] = useState("");

  // Rules
  const [houseRules, setHouseRules] = useState("");
  const [noticePeriodDays, setNoticePeriodDays] = useState("");

  // Condition declaration
  const [includeCondition, setIncludeCondition] = useState(true);
  const [areas, setAreas] = useState(emptyConditionAreas());
  const [knownDefects, setKnownDefects] = useState("");
  const [maintenanceLandlord, setMaintenanceLandlord] = useState(DEFAULT_MAINTENANCE_LANDLORD);
  const [maintenanceTenant, setMaintenanceTenant] = useState(DEFAULT_MAINTENANCE_TENANT);
  const [roomName, setRoomName] = useState("");
  const [photos, setPhotos] = useState<RoomPhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [conditionError, setConditionError] = useState<string | null>(null);

  // Templates
  const [templates, setTemplates] = useState<LeaseTemplate[] | null>(null);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reviewSettling, setReviewSettling] = useState(false);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    fetchTemplates(session.email).then(setTemplates);
  }, [session]);

  // The "Publish listing" submit button occupies the same spot the
  // "Continue" button was just in, so a normal rapid double-click on
  // Continue — habitual for a lot of people — landed its second click on
  // Publish before anyone actually saw the review step, publishing instantly.
  // A brief lock closes that window without adding any friction to a real,
  // deliberate publish click.
  useEffect(() => {
    if (step !== STEPS.length - 1) {
      setReviewSettling(false);
      return;
    }
    setReviewSettling(true);
    const t = setTimeout(() => setReviewSettling(false), 600);
    return () => clearTimeout(t);
  }, [step]);

  const amountNum = Number(amountPerPeriod) || 0;
  const periodsNum = Number(totalPeriods) || 0;
  const total = useMemo(() => amountNum * periodsNum, [amountNum, periodsNum]);
  const securityDepositNum = includeSecurityDeposit ? Number(securityDepositAmount) || 0 : 0;
  const cautionLabel = useCautionFeeLabel();
  const annualRent = amountNum > 0 ? amountNum * (365 / INTERVAL_DAYS[frequency]) : 0;
  const cautionRange = suggestedCautionRange(annualRent);
  const cautionIsHigh = isCautionFeeHigh(securityDepositNum, annualRent);

  const previewNodes: EscrowTimelineNodeData[] = useMemo(() => {
    if (amountNum <= 0 || periodsNum <= 0) return [];
    const intervalMs = INTERVAL_DAYS[frequency] * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return Array.from({ length: periodsNum }, (_, i) => ({
      period: i + 1,
      status: "upcoming" as const,
      releaseDate: new Date(now + (i + 1) * intervalMs),
      amount: amountNum,
    }));
  }, [amountNum, periodsNum, frequency]);

  const handleLoadTemplate = (templateId: string) => {
    const template = templates?.find((t) => t.id === templateId);
    if (!template) return;
    setPropertyType(template.propertyType);
    setAmenities(template.amenities);
    setAmountPerPeriod(String(template.amountPerPeriod));
    setTotalPeriods(String(template.totalPeriods));
    setFrequency(template.frequency);
    setIncludeSecurityDeposit(template.securityDeposit !== null);
    setSecurityDepositAmount(template.securityDeposit !== null ? String(template.securityDeposit) : "");
    setHouseRules(template.houseRules);
    setNoticePeriodDays(template.noticePeriodDays !== null ? String(template.noticePeriodDays) : "");
    setMaintenanceLandlord(template.maintenanceLandlord || DEFAULT_MAINTENANCE_LANDLORD);
    setMaintenanceTenant(template.maintenanceTenant || DEFAULT_MAINTENANCE_TENANT);
  };

  const addAmenity = () => {
    const value = amenityInput.trim();
    if (!value || amenities.includes(value)) return;
    setAmenities((prev) => [...prev, value]);
    setAmenityInput("");
  };

  const removeAmenity = (value: string) => {
    setAmenities((prev) => prev.filter((a) => a !== value));
  };

  const goNext = () => {
    if (step === 0) {
      const result = propertyStepSchema.safeParse({ propertyAddress, propertyType, photoUrl });
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of result.error.issues) fieldErrors[issue.path[0] as string] = issue.message;
        setErrors(fieldErrors);
        return;
      }
    }
    if (step === 1) {
      const result = termsStepSchema.safeParse({ amountPerPeriod, totalPeriods, frequency });
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of result.error.issues) fieldErrors[issue.path[0] as string] = issue.message;
        setErrors(fieldErrors);
        return;
      }
      if (includeSecurityDeposit && securityDepositNum <= 0) {
        setErrors({ securityDeposit: "Enter a security deposit amount, or turn the toggle off." });
        return;
      }
    }
    if (step === 3 && includeCondition && photos.length === 0) {
      setConditionError("Add at least one room photo, or turn off the condition declaration.");
      return;
    }
    setErrors({});
    setConditionError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      let condition: ConditionDeclaration | null = null;
      if (includeCondition) {
        const declaredAt = Date.now();
        const base = {
          areas,
          knownDefects,
          maintenanceLandlord,
          maintenanceTenant,
          photos,
          videoUrl: videoUrl.trim() || null,
          declaredAt,
        };
        const hash = await hashDeclaration(base);
        condition = { ...base, hash };
      }

      const listing = await createListing({
        landlordEmail: session.email,
        landlordAddress: session.address,
        propertyAddress,
        propertyType,
        photoUrl: photoUrl || null,
        amountPerPeriod: amountNum,
        totalPeriods: periodsNum,
        frequency,
        condition,
        amenities,
        securityDeposit: includeSecurityDeposit ? securityDepositNum : null,
        houseRules: houseRules.trim(),
        noticePeriodDays: noticePeriodDays ? Number(noticePeriodDays) : null,
      });

      if (saveAsTemplate && templateName.trim()) {
        await saveTemplate({
          landlordEmail: session.email,
          name: templateName.trim(),
          propertyType,
          amenities,
          amountPerPeriod: amountNum,
          totalPeriods: periodsNum,
          frequency,
          securityDeposit: includeSecurityDeposit ? securityDepositNum : null,
          houseRules: houseRules.trim(),
          noticePeriodDays: noticePeriodDays ? Number(noticePeriodDays) : null,
          maintenanceLandlord,
          maintenanceTenant,
        });
      }

      router.push(`/listings/${listing.id}`);
    } catch {
      setSubmitError("Could not publish this listing. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const setAreaStatus = (key: ConditionAreaKey, status: ConditionStatus) => {
    setAreas((prev) => ({ ...prev, [key]: { ...prev[key], status } }));
  };

  const setAreaNotes = (key: ConditionAreaKey, notes: string) => {
    setAreas((prev) => ({ ...prev, [key]: { ...prev[key], notes } }));
  };

  const setAreaResponsibility = (key: ConditionAreaKey, responsibility: Responsibility) => {
    setAreas((prev) => ({ ...prev, [key]: { ...prev[key], responsibility } }));
  };

  const handleAddRoomPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file || !roomName.trim()) return;

    setConditionError(null);
    if (file.size > 5 * 1024 * 1024) {
      setConditionError("Image must be under 5MB.");
      return;
    }

    setUploadingPhoto(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 800);
      const hash = await sha256Hex(dataUrl);
      const url = await uploadDataUrl(dataUrl, "condition");
      setPhotos((prev) => [...prev, { room: roomName.trim(), url, hash }]);
      setRoomName("");
    } catch {
      setConditionError("Could not upload that image. Try a different file.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCoverPhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;

    setCoverPhotoError(null);
    if (file.size > 5 * 1024 * 1024) {
      setCoverPhotoError("Image must be under 5MB.");
      return;
    }

    setUploadingCoverPhoto(true);
    try {
      setPhotoUrl(await uploadImage(file, "listings"));
    } catch {
      setCoverPhotoError("Could not upload that image. Try a different file.");
    } finally {
      setUploadingCoverPhoto(false);
    }
  };

  const handleVideoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;

    setVideoError(null);
    if (file.size > 20 * 1024 * 1024) {
      setVideoError("Video must be under 20MB.");
      return;
    }

    setUploadingVideo(true);
    try {
      setVideoUrl(await uploadFile(file, "videos"));
    } catch {
      setVideoError("Could not upload that video. Try a different file.");
    } finally {
      setUploadingVideo(false);
    }
  };

  if (isLoading || !session) return null;

  return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl text-ink">List a property</h1>
        <p className="mt-1 text-ink-muted">
          Set your terms — tenants can find and rent this once it&apos;s published.
        </p>

        {/* Step indicator */}
        <div className="mt-6 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step
                    ? "bg-forest-500 text-cream-50"
                    : i === step
                      ? "border-2 border-forest-500 text-forest-500"
                      : "border border-forest-100 text-ink-soft"
                }`}
              >
                {i + 1}
              </div>
              <span className={`hidden text-xs sm:block ${i === step ? "font-semibold text-ink" : "text-ink-soft"}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && <div className={`h-px flex-1 ${i < step ? "bg-forest-500" : "bg-forest-100"}`} />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
          {/* Step 0: Property details */}
          {step === 0 && (
            <Card>
              <CardContent className="flex flex-col gap-4 pt-6">
                {templates && templates.length > 0 && (
                  <div className="flex flex-col gap-1.5 rounded-md bg-forest-50 p-3">
                    <label className="text-sm font-medium text-forest-500">Start from a template</label>
                    <select
                      onChange={(e) => handleLoadTemplate(e.target.value)}
                      defaultValue=""
                      className="h-10 rounded-md border border-forest-100 bg-cream-50 px-3 text-sm text-ink"
                    >
                      <option value="" disabled>
                        Choose a saved template…
                      </option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <Input
                  label="Property address"
                  placeholder="14 Admiralty Way, Lekki, Lagos"
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                  error={errors.propertyAddress}
                />

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-muted">Property type</label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {PROPERTY_TYPES.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setPropertyType(type.value)}
                        className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                          propertyType === type.value
                            ? "border-forest-400 bg-forest-50 text-forest-500"
                            : "border-forest-100 text-ink-muted hover:border-forest-200"
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-muted">Amenities</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Parking, Generator, Furnished"
                      value={amenityInput}
                      onChange={(e) => setAmenityInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAmenity();
                        }
                      }}
                      className="h-11 flex-1 rounded-md border border-forest-100 bg-cream-50 px-4 text-[15px] text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                    />
                    <Button type="button" variant="secondary" onClick={addAmenity}>
                      Add
                    </Button>
                  </div>
                  {amenities.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {amenities.map((a) => (
                        <span
                          key={a}
                          className="flex items-center gap-1.5 rounded-full bg-forest-50 px-3 py-1 text-xs font-medium text-forest-500"
                        >
                          {a}
                          <button type="button" onClick={() => removeAmenity(a)} className="text-forest-400 hover:text-forest-600">
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Input
                    label="Property photo URL (optional)"
                    placeholder="Leave blank to use a generated image"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    error={errors.photoUrl}
                  />
                  {!photoUrl && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-ink-soft">or</span>
                      <label className="cursor-pointer text-sm font-medium text-forest-500 underline">
                        {uploadingCoverPhoto ? "Uploading…" : "Upload a photo"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={uploadingCoverPhoto}
                          onChange={handleCoverPhotoUpload}
                        />
                      </label>
                    </div>
                  )}
                  {coverPhotoError && <p className="text-xs text-terracotta-500">{coverPhotoError}</p>}
                  {photoUrl && photoUrl.startsWith("data:") && (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotoUrl("")}
                        className="text-xs font-medium text-terracotta-500 underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 1: Terms */}
          {step === 1 && (
            <Card>
              <CardContent className="flex flex-col gap-5 pt-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-muted">Release frequency</label>
                  <SegmentedControl
                    name="listing-frequency"
                    options={FREQUENCY_OPTIONS}
                    value={frequency}
                    onChange={setFrequency}
                  />
                  {errors.frequency && <p className="text-sm text-terracotta-500">{errors.frequency}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Input
                      label={`Rent per ${FREQUENCY_UNIT_LABEL[frequency]} (USDC)`}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="450"
                      value={amountPerPeriod}
                      onChange={(e) => setAmountPerPeriod(e.target.value)}
                      error={errors.amountPerPeriod}
                    />
                    {amountNum > 0 && <CurrencyEquivalent usdcAmount={amountNum} className="text-xs text-ink-soft" />}
                  </div>
                  <Input
                    label="Number of periods"
                    type="number"
                    min="1"
                    step="1"
                    value={totalPeriods}
                    onChange={(e) => setTotalPeriods(e.target.value)}
                    error={errors.totalPeriods}
                  />
                </div>

                <motion.div layout className="rounded-md bg-forest-50 p-4 text-sm text-forest-500">
                  {amountNum > 0 && periodsNum > 0 ? (
                    <>
                      A tenant renting this will deposit <strong className="inline-flex items-center gap-1"><UsdcAmount amount={total} /></strong>{" "}
                      total. You&apos;ll receive <strong className="inline-flex items-center gap-1"><UsdcAmount amount={amountNum} /></strong> every{" "}
                      {FREQUENCY_UNIT_LABEL[frequency]} for {periodsNum} periods.
                    </>
                  ) : (
                    "Enter an amount and number of periods to see your payout summary."
                  )}
                </motion.div>

                <div className="flex flex-col gap-3 border-t border-forest-100 pt-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink-muted">
                    <input
                      type="checkbox"
                      checked={includeSecurityDeposit}
                      onChange={(e) => setIncludeSecurityDeposit(e.target.checked)}
                      className="h-4 w-4 rounded border-forest-200"
                    />
                    Request a {cautionLabel.term.toLowerCase()}
                  </label>
                  {includeSecurityDeposit && (
                    <>
                      <Input
                        label={`${cautionLabel.term} (USDC)`}
                        hint={cautionLabel.tooltip}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. one month's rent"
                        value={securityDepositAmount}
                        onChange={(e) => setSecurityDepositAmount(e.target.value)}
                        error={errors.securityDeposit}
                      />
                      {securityDepositNum > 0 && (
                        <CurrencyEquivalent usdcAmount={securityDepositNum} className="text-xs text-ink-soft" />
                      )}
                      {annualRent > 0 && (
                        <p className="text-xs text-ink-soft">
                          Typical range: {cautionRange.min.toFixed(0)}–{cautionRange.max.toFixed(0)} USDC (10–25% of
                          annual rent)
                        </p>
                      )}
                      {cautionIsHigh && (
                        <p className="text-xs text-terracotta-500">
                          High {cautionLabel.term.toLowerCase()}s deter good tenants — this amount will be shown
                          prominently on your lease.
                        </p>
                      )}
                      <p className="text-xs text-ink-soft">
                        Held in the same escrow contract as rent, separate from rent tranches (Article 1.6). It
                        releases to the tenant automatically 7 days after the lease ends unless you file an
                        itemized damage claim.
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Rules */}
          {step === 2 && (
            <Card>
              <CardContent className="flex flex-col gap-5 pt-6">
                <p className="text-sm text-ink-muted">Optional — house rules and termination notice for tenants.</p>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-muted">House rules</label>
                  <textarea
                    placeholder="e.g. No smoking indoors. No subletting without consent."
                    value={houseRules}
                    onChange={(e) => setHouseRules(e.target.value)}
                    rows={4}
                    className="rounded-md border border-forest-100 bg-cream-50 px-4 py-2.5 text-[15px] text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-muted">Notice period for termination</label>
                  <select
                    value={noticePeriodDays}
                    onChange={(e) => setNoticePeriodDays(e.target.value)}
                    className="h-11 rounded-md border border-forest-100 bg-cream-50 px-4 text-[15px] text-ink"
                  >
                    {NOTICE_PERIOD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Condition declaration */}
          {step === 3 && (
            <Card>
              <CardContent className="flex flex-col gap-5 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">Property condition declaration</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      Declare the state of each area, disclose known defects, and upload baseline
                      photos. Disclosed issues can&apos;t later be raised as a dispute — undisclosed
                      problems that break can. Protects you both.
                    </p>
                    <blockquote className="mt-2 border-l-2 border-forest-200 pl-3 text-xs italic text-ink-soft">
                      &ldquo;The Disclosure Shield: any defect the landlord discloses... before
                      signing cannot be the basis of a dispute by the tenant.&rdquo;
                      <br />— The RentPact Constitution, Article 2.3{" "}
                      <Link href="/constitution" target="_blank" className="not-italic underline">
                        Read in full
                      </Link>
                    </blockquote>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-sm text-ink-muted">
                    <input
                      type="checkbox"
                      checked={includeCondition}
                      onChange={(e) => setIncludeCondition(e.target.checked)}
                      className="h-4 w-4 rounded border-forest-200"
                    />
                    Include
                  </label>
                </div>

                {includeCondition && (
                  <>
                    <div className="flex flex-col gap-4 border-t border-forest-100 pt-4">
                      {CONDITION_AREAS.map((area) => (
                        <div key={area.key} className="flex flex-col gap-2">
                          <div>
                            <p className="text-sm font-medium text-ink">{area.label}</p>
                            <p className="text-xs text-ink-soft">{area.helper}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {CONDITION_STATUS_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setAreaStatus(area.key, opt.value)}
                                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                                  areas[area.key].status === opt.value
                                    ? opt.value === "known-issue"
                                      ? "border-terracotta-400 bg-terracotta-50 text-terracotta-600"
                                      : opt.value === "partial"
                                        ? "border-gold-400 bg-gold-50 text-gold-600"
                                        : "border-forest-400 bg-forest-50 text-forest-500"
                                    : "border-forest-100 text-ink-muted hover:border-forest-200"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={areas[area.key].notes}
                            onChange={(e) => setAreaNotes(area.key, e.target.value)}
                            className="h-10 rounded-md border border-forest-100 bg-cream-50 px-3 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                          />
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-ink-soft">Responsible:</span>
                            {RESPONSIBILITY_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setAreaResponsibility(area.key, opt.value)}
                                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                                  areas[area.key].responsibility === opt.value
                                    ? "border-forest-400 bg-forest-50 text-forest-500"
                                    : "border-forest-100 text-ink-muted hover:border-forest-200"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-ink-soft">
                      Sets the Maintenance Responsibility Matrix (Constitution Article 2.5) — this
                      determines which issue reports a tenant can escalate into a dispute.
                    </p>

                    <div className="flex flex-col gap-1.5 border-t border-forest-100 pt-4">
                      <label className="text-sm font-medium text-ink-muted">Known defects</label>
                      <textarea
                        placeholder="e.g. The bathroom tap drips. AC in bedroom 2 not working."
                        value={knownDefects}
                        onChange={(e) => setKnownDefects(e.target.value)}
                        rows={3}
                        className="rounded-md border border-forest-100 bg-cream-50 px-4 py-2.5 text-[15px] text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                      />
                    </div>

                    <div className="grid gap-4 border-t border-forest-100 pt-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-ink-muted">Landlord handles</label>
                        <textarea
                          value={maintenanceLandlord}
                          onChange={(e) => setMaintenanceLandlord(e.target.value)}
                          rows={3}
                          className="rounded-md border border-forest-100 bg-cream-50 px-4 py-2.5 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-ink-muted">Tenant handles</label>
                        <textarea
                          value={maintenanceTenant}
                          onChange={(e) => setMaintenanceTenant(e.target.value)}
                          rows={3}
                          className="rounded-md border border-forest-100 bg-cream-50 px-4 py-2.5 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-forest-100 pt-4">
                      <label className="text-sm font-medium text-ink-muted">
                        Baseline photos — at least one room required
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          placeholder="Room name, e.g. Kitchen"
                          value={roomName}
                          onChange={(e) => setRoomName(e.target.value)}
                          className="h-10 flex-1 rounded-md border border-forest-100 bg-cream-50 px-3 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
                        />
                        <label
                          className={`cursor-pointer rounded-md border px-3 py-2 text-sm font-medium ${
                            roomName.trim() ? "border-forest-400 text-forest-500" : "border-forest-100 text-ink-soft"
                          }`}
                        >
                          {uploadingPhoto ? "Uploading…" : "Add photo"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            disabled={!roomName.trim() || uploadingPhoto}
                            onChange={handleAddRoomPhoto}
                          />
                        </label>
                      </div>

                      {photos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {photos.map((photo, i) => (
                            <div key={i} className="relative overflow-hidden rounded-md border border-forest-100">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photo.url} alt={photo.room} className="h-20 w-full object-cover" />
                              <div className="flex items-center justify-between bg-cream-400 px-1.5 py-1">
                                <span className="truncate text-[11px] text-ink-muted">{photo.room}</span>
                                <button
                                  type="button"
                                  onClick={() => removePhoto(i)}
                                  className="text-[11px] font-medium text-terracotta-500"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <Input
                          label="Walkthrough video URL (optional)"
                          placeholder="https://…"
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                        />
                        {!videoUrl && (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-ink-soft">or</span>
                            <label className="cursor-pointer text-sm font-medium text-forest-500 underline">
                              {uploadingVideo ? "Uploading…" : "Upload a video"}
                              <input
                                type="file"
                                accept="video/mp4,video/webm,video/quicktime"
                                className="hidden"
                                disabled={uploadingVideo}
                                onChange={handleVideoUpload}
                              />
                            </label>
                          </div>
                        )}
                        {videoError && <p className="text-xs text-terracotta-500">{videoError}</p>}
                        {videoUrl && videoUrl.startsWith("data:") && (
                          <div className="flex items-center gap-2">
                            <video src={videoUrl} controls className="h-24 rounded-md" />
                            <button
                              type="button"
                              onClick={() => setVideoUrl("")}
                              className="text-xs font-medium text-terracotta-500 underline"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {conditionError && <p className="text-sm text-terracotta-500">{conditionError}</p>}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 4: Review & summary */}
          {step === 4 && (
            <>
              <Card>
                <CardContent className="flex flex-col gap-4 pt-6">
                  <h2 className="text-lg font-semibold text-ink">Review</h2>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <ReviewRow label="Address" value={propertyAddress} />
                    <ReviewRow label="Type" value={propertyType} className="capitalize" />
                    <ReviewRow label="Rent per period" value={<UsdcAmount amount={amountNum} />} />
                    <ReviewRow label="Frequency" value={FREQUENCY_UNIT_LABEL[frequency]} className="capitalize" />
                    <ReviewRow label="Periods" value={String(periodsNum)} />
                    <ReviewRow
                      label={cautionLabel.term}
                      value={
                        includeSecurityDeposit ? (
                          <span className="inline-flex items-center gap-1">
                            <UsdcAmount amount={securityDepositNum} /> (refundable)
                          </span>
                        ) : (
                          "None"
                        )
                      }
                    />
                    <ReviewRow label="Amenities" value={amenities.length > 0 ? amenities.join(", ") : "None listed"} />
                    <ReviewRow label="Condition declaration" value={includeCondition ? `${photos.length} photos` : "Skipped"} />
                  </dl>

                  <div className="rounded-md bg-forest-50 p-4 text-sm text-forest-500">
                    <p>
                      Rent: <UsdcAmount amount={total} className="font-semibold" />
                    </p>
                    {includeSecurityDeposit && (
                      <p>
                        {cautionLabel.term}: <UsdcAmount amount={securityDepositNum} className="font-semibold" /> (refundable)
                      </p>
                    )}
                    <p className="mt-1 border-t border-forest-200 pt-1">
                      A tenant renting this will deposit{" "}
                      <strong className="inline-flex items-center gap-1">
                        <UsdcAmount amount={total + securityDepositNum} />
                      </strong>{" "}
                      total into the escrow contract.
                    </p>
                    <CurrencyEquivalent usdcAmount={total + securityDepositNum} className="mt-1 block text-xs text-forest-400" />
                  </div>

                  <p className="rounded-md bg-gold-50 px-4 py-3 text-sm text-gold-700">
                    ⚡ This transaction is free — gas is covered by Circle&apos;s Gas Station.
                  </p>
                </CardContent>
              </Card>

              {previewNodes.length > 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <h2 className="mb-5 text-lg font-semibold text-ink">Release schedule preview</h2>
                    <EscrowTimeline frequency={frequency} nodes={previewNodes} />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="flex flex-col gap-3 pt-6">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink-muted">
                    <input
                      type="checkbox"
                      checked={saveAsTemplate}
                      onChange={(e) => setSaveAsTemplate(e.target.checked)}
                      className="h-4 w-4 rounded border-forest-200"
                    />
                    Save these terms as a reusable template
                  </label>
                  {saveAsTemplate && (
                    <Input
                      label="Template name"
                      placeholder="e.g. Standard studio unit"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {submitError && <p className="text-sm text-terracotta-500">{submitError}</p>}

          <div className="flex gap-3">
            {step > 0 && (
              <Button type="button" variant="secondary" onClick={goBack}>
                Back
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" size="lg" className="flex-1" onClick={goNext}>
                Continue
              </Button>
            ) : (
              <Button type="submit" size="lg" className="flex-1" disabled={submitting || reviewSettling}>
                {submitting ? "Publishing…" : "Publish listing"}
              </Button>
            )}
          </div>
        </form>
      </div>
  );
}

function ReviewRow({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className={`mt-1 font-medium text-ink ${className ?? ""}`}>{value}</dd>
    </div>
  );
}

/**
 * Live snapshot pulled from PriceLabs `get_available_nudges` on 2026-08-06.
 * listing_id is PriceLabs' compound id ("<elev8-uuid>___<pricelabs-uuid>") and matches
 * ListingExternalRef.externalId where system = "PRICELABS". One-time manual capture;
 * replace with a real nightly REST sync once a PriceLabs API key is configured.
 */
export const PRICELABS_NUDGES = [
  {
    listing_id: "8810c986-36ce-4f3c-87b2-192a89b7e3c6___ae02b650-1e4c-4337-aad1-c3df8edf0a25",
    listing_name: "The R Apartment Mittelfelsen - Quiet, Free Parking - CH - Mittelfelsen",
    nudge_id: "110955493_20260805023033",
    nudge_type: "base_price",
    current_value: 140,
    suggested_value: 150,
    direction: "increase",
    reason: "Recommendation generated on 05 Aug, 2026 UTC based on a Base Price of 140 CHF.",
    expiration: "2026-08-12T00:30:00.000Z",
    status: "pending",
  },
  {
    listing_id: "2d136eee-42ce-49d2-8f49-d3bc7eec33c8___f73b62a9-85ed-40d9-b39e-dc320833a687",
    listing_name: "The R Apartment Roggen - CH - Roggen",
    nudge_id: "110955469_20260803022158",
    nudge_type: "base_price",
    current_value: 110,
    suggested_value: 118,
    direction: "increase",
    reason: "Recommendation generated on 03 Aug, 2026 UTC based on a Base Price of 110 CHF.",
    expiration: "2026-08-10T00:30:00.000Z",
    status: "pending",
  },
  {
    listing_id: "f7d40ca3-f73a-4f66-b23d-a49f4262036a___71c683cb-f121-483a-a267-dcc96319d642",
    listing_name: "The R Apartment Zugerberg - EV Wallbox - Terrasse - CH- Zugerberg",
    nudge_id: "110955483_20260801022500",
    nudge_type: "base_price",
    current_value: 170,
    suggested_value: 183,
    direction: "increase",
    reason: "Recommendation generated on 01 Aug, 2026 UTC based on a Base Price of 170 CHF.",
    expiration: "2026-08-08T00:30:00.000Z",
    status: "pending",
  },
  {
    listing_id: "8e2f819b-a284-4611-8638-23986ac53117___326a490a-9ef5-4fbf-b68f-79fc297c57e1",
    listing_name: "The R Suites Hasenberg - The R Suites Hasenberg",
    nudge_id: "110955495_20260801022516",
    nudge_type: "base_price",
    current_value: 104,
    suggested_value: 112,
    direction: "increase",
    reason: "Recommendation generated on 01 Aug, 2026 UTC based on a Base Price of 104 CHF.",
    expiration: "2026-08-08T00:30:00.000Z",
    status: "pending",
  },
] as const;

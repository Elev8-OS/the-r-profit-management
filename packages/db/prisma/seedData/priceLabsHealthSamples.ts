/**
 * Live snapshots pulled from PriceLabs `get_listing_health_and_recommendations` on
 * 2026-08-06/07 for a representative sample of listings (not the full 52 — a real nightly
 * job would call this per listing). listing_id is PriceLabs' compound id and matches
 * ListingExternalRef.externalId where system = "PRICELABS".
 *
 * IMPORTANT — this data already demonstrates why raw "nights unbooked" counts are
 * misleading without market context: both "Studio + Plunge Pool" and "Villa Merapi"
 * show large upcoming gaps in Elev8's raw gap calendar, yet PriceLabs' own health check
 * says both are *outperforming* their market for the current month (heading color
 * "Blue"). The Opportunity Score must use this market-relative signal as the primary
 * occupancy dimension, not the raw gap count alone.
 */
export const PRICELABS_HEALTH_SAMPLES = [
  {
    listing_id: "1ed9c430-09bd-497e-816f-ca5837296b3f___4de7f331-6ebc-44ab-bfdb-92f6f405cd1d",
    listing_name: "The R Pererenan Mezzanine Studio + Plunge Pool",
    analyzed_at: "2026-08-06T00:00:00.000Z",
    heading_color: "Blue",
    heading_text:
      "Your occupancy is higher than the market. You might want to increase your prices slightly to maximize revenue, especially for peak dates or weekends.",
    market_section: [
      ["August(High Season)", "Market Occupancy is 42%, Your occupancy is 62.0%", "Market reached 74% occupancy last year", "Bookings generally happen 0-5 days before stay"],
      ["September(High Season)", "Market Occupancy is 18%, Your occupancy is 23.0%", "Market reached 68% occupancy last year", "Bookings generally happen 0-18 days before stay"],
      ["October(Shoulder Season)", "Market Occupancy is 9%, Your occupancy is 16.0%", "Market reached 67% occupancy last year", "Bookings generally happen 1-13 days before stay"],
    ],
    recommendation_section: {},
  },
  {
    listing_id: "afa397b2-7857-42f2-afe7-76f44e2372a4___05e77a25-1600-48b4-b984-5369062a9d0b",
    listing_name: "The R Villa Merapi",
    analyzed_at: "2026-08-06T00:00:00.000Z",
    heading_color: "Blue",
    heading_text:
      "Your occupancy is higher than the market. You might want to increase your prices slightly to maximize revenue, especially for peak dates or weekends.",
    market_section: [
      ["August(Shoulder Season)", "Market Occupancy is 31%, Your occupancy is 62.0%", "Market reached 44% occupancy last year", "Bookings generally happen 0-1 days before stay"],
      ["September(High Season)", "Market Occupancy is 16%, Your occupancy is 2.0%", "Market reached 47% occupancy last year", "Bookings generally happen 0-13 days before stay"],
      ["October(Shoulder Season)", "Market Occupancy is 9%, Your occupancy is 0.0%", "Market reached 44% occupancy last year", "Bookings generally happen 1-9 days before stay"],
    ],
    recommendation_section: {},
    // Supplementary: diagnose_no_bookings was also run for this listing (a different
    // Merapi room unit than the health check above — Elev8/PriceLabs split Merapi into
    // multiple room-level listings, see seedListingsData.ts). It found: 0% occupancy vs
    // 27% market for the next 30 days, base price CHF 50 (already below the CHF 52
    // recommended base price), no problematic customizations, flat demand/seasonality.
    // Bottom line from PriceLabs' own diagnosis: price is not the primary issue for that
    // unit — worth checking listing amenities, guest ratings, and location per PriceLabs'
    // own caveat.
    diagnose_no_bookings_note:
      "Separate room-level listing under this property: 0% occ vs 27% market (next 30d), base price CHF 50 already below recommended CHF 52 — PriceLabs explicitly says pricing is not the likely cause; check amenities/ratings/location instead.",
  },
  {
    listing_id: "8e2f819b-a284-4611-8638-23986ac53117___326a490a-9ef5-4fbf-b68f-79fc297c57e1",
    listing_name: "The R Suites Hasenberg",
    analyzed_at: "2026-08-06T00:00:00.000Z",
    heading_color: "Blue",
    heading_text:
      "Your occupancy is higher than the market. You might want to increase your prices slightly to maximize revenue, especially for peak dates or weekends.",
    market_section: [
      ["August(High Season)", "Market Occupancy is 41%, Your occupancy is 85.0%", "Market reached 63% occupancy last year", "Bookings generally happen 0-6 days before stay"],
      ["September(High Season)", "Market Occupancy is 21%, Your occupancy is 0.0%", "Market reached 67% occupancy last year", "Bookings generally happen 1-20 days before stay"],
      ["October(Shoulder Season)", "Market Occupancy is 8%, Your occupancy is 0.0%", "Market reached 54% occupancy last year", "Bookings generally happen 1-13 days before stay"],
    ],
    // This listing DOES have concrete PriceLabs recommendations — a good example of the
    // recommendation_section being populated and ready to surface verbatim in the UI.
    recommendation_section: {
      base_price: {
        value: "112",
        header: "Adjust your Base Price",
        text: "We recommend changing your base price to CHF 112. Please visit Base Price Helper for info.",
      },
      min_stay: {
        value: 2,
        header: "Review Minimum Stay Requirement",
        text: "We recommend decreasing your minimum stay restriction to 2 as many bookings in your market are for 2 nights",
      },
      last_minute_part: {
        header: "Review Last Minute setting",
        text: "Your current Last Minute Factor (-5% in last 15 days) is quite conservative. Our Market recommended setting suggests up to 35% discount over the last 14 days. We recommend switching to stay competitive",
        value: "",
      },
    },
  },
  {
    listing_id: "a34cc21d-f853-488e-ba11-a42902a6b0aa___254a15a0-f81a-45a1-8bed-60b445933f81",
    listing_name: "TAMBORA - The R Tambora: Stylish 3BR Tropical Escape",
    analyzed_at: "2026-08-06T00:00:00.000Z",
    heading_color: "Blue",
    heading_text:
      "Your occupancy is higher than the market. You might want to increase your prices slightly to maximize revenue, especially for peak dates or weekends.",
    market_section: [
      ["August(High Season)", "Market Occupancy is 52%, Your occupancy is 65.0%", "Market reached 66% occupancy last year", "Bookings generally happen 0-1 days before stay"],
      ["September(Shoulder Season)", "Market Occupancy is 25%, Your occupancy is 23.0%", "Market reached 61% occupancy last year", "Bookings generally happen 0-17 days before stay"],
      ["October(Shoulder Season)", "Market Occupancy is 12%, Your occupancy is 32.0%", "Market reached 58% occupancy last year", "Bookings generally happen 1-23 days before stay"],
    ],
    recommendation_section: {},
  },
] as const;

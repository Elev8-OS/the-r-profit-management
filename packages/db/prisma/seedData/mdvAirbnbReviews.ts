/**
 * Live snapshot pulled from MyDataValue `get_reviews(channel: "airbnb")` on 2026-08-06.
 * review_score is on Airbnb's native 0-5 scale (must be scaled to 0-10 to compare with
 * Booking.com). listing_id matches ListingExternalRef.externalId where
 * system = "MDV_AIRBNB". One-time manual capture; replace with a real nightly REST sync
 * once MDV API credentials exist.
 */
export const MDV_AIRBNB_REVIEWS = [
  { listing_id: "1007656140994525317", review_score: 4.73, review_count: 11 },
  { listing_id: "1032951292595893966", review_score: 4.9, review_count: 10 },
  { listing_id: "1058082156580364078", review_score: 4.76, review_count: 29 },
  { listing_id: "1076660092269436659", review_score: 4.63, review_count: 27 },
  { listing_id: "1104531825115304989", review_score: 5, review_count: 4 },
  { listing_id: "1135860716568917181", review_score: 4.87, review_count: 39 },
  { listing_id: "1172137348780932221", review_score: 4.76, review_count: 34 },
  { listing_id: "1172140370078808736", review_score: 4.74, review_count: 66 },
  { listing_id: "1174006137271303122", review_score: 4.2, review_count: 5 },
  { listing_id: "1175211811818785379", review_score: 4.88, review_count: 24 },
  { listing_id: "1247599834613266855", review_score: 4.69, review_count: 13 },
  { listing_id: "1277433630517357044", review_score: 4.75, review_count: 36 },
  { listing_id: "1288239649379720848", review_score: 4.85, review_count: 20 },
  { listing_id: "1289721832904643568", review_score: 4.63, review_count: 16 },
  { listing_id: "1295575837920024785", review_score: 4.76, review_count: 25 },
  { listing_id: "1309976316951867073", review_score: 4.73, review_count: 33 },
  { listing_id: "1310022327071563461", review_score: 4.73, review_count: 22 },
  { listing_id: "1320482682181602577", review_score: 5, review_count: 7 },
  { listing_id: "1325947572653903576", review_score: 4.2, review_count: 15 },
  { listing_id: "1339703527804799550", review_score: 4.83, review_count: 29 },
  { listing_id: "1339824939119223124", review_score: 4.54, review_count: 13 },
  { listing_id: "1341088473820921591", review_score: 3.88, review_count: 8 },
  { listing_id: "1357772448274126922", review_score: 4.6, review_count: 10 },
  { listing_id: "1384704061613121989", review_score: 4, review_count: 1 },
  { listing_id: "1407082252509312531", review_score: 4.33, review_count: 9 },
  { listing_id: "1427322486212619176", review_score: 4.71, review_count: 14 },
  { listing_id: "1445833430700201175", review_score: 5, review_count: 2 },
  { listing_id: "1590137712631990770", review_score: 4.82, review_count: 11 },
  { listing_id: "1715763395157036279", review_score: 4.5, review_count: 4 },
  { listing_id: "1715783933278826776", review_score: 0, review_count: 0 },
  { listing_id: "1715802010180185405", review_score: null, review_count: null },
  { listing_id: "882599984739548614", review_score: 4.53, review_count: 49 },
  { listing_id: "907785869402704341", review_score: 4.82, review_count: 85 },
  { listing_id: "921635788498958884", review_score: 5, review_count: 21 },
  { listing_id: "921663489922034551", review_score: 4.84, review_count: 37 },
  { listing_id: "992563175432177910", review_score: 4.67, review_count: 24 },
] as const;

export const MDV_AIRBNB_REVIEWS_AS_OF = "2026-08-06";

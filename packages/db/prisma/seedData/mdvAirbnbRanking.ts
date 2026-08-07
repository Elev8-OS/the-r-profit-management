/**
 * Live snapshot pulled from MyDataValue `get_ranking(channel: "airbnb")` on 2026-08-06.
 * listing_id matches ListingExternalRef.externalId where system = "MDV_AIRBNB".
 * Airbnb's ranking is forward-looking (next 28 days) and already includes computed
 * search_to_view_rate / view_to_booking_rate — no need to re-derive them.
 * One-time manual capture (see seedOpportunitySignals.ts); replace with a real nightly
 * REST sync once MDV API credentials exist.
 */
export const MDV_AIRBNB_RANKING = [
  { listing_id: "1007656140994525317", search_views: 5806, property_views: 200, booking_conversions: 0, search_to_view_rate: 0.03444712366517396, view_to_booking_rate: 0 },
  { listing_id: "1032951292595893966", search_views: 1188, property_views: 41, booking_conversions: 0, search_to_view_rate: 0.034511784511784514, view_to_booking_rate: 0 },
  { listing_id: "1058082156580364078", search_views: 7249, property_views: 921, booking_conversions: 0, search_to_view_rate: 0.12705200717340323, view_to_booking_rate: 0 },
  { listing_id: "1076660092269436659", search_views: 947, property_views: 41, booking_conversions: 0, search_to_view_rate: 0.04329461457233368, view_to_booking_rate: 0 },
  { listing_id: "1104531825115304989", search_views: 3328, property_views: 183, booking_conversions: 0, search_to_view_rate: 0.05498798076923077, view_to_booking_rate: 0 },
  { listing_id: "1135860716568917181", search_views: 2346, property_views: 285, booking_conversions: 0, search_to_view_rate: 0.12148337595907928, view_to_booking_rate: 0 },
  { listing_id: "1172137348780932221", search_views: 3574, property_views: 253, booking_conversions: 1, search_to_view_rate: 0.07078903189703413, view_to_booking_rate: 0.003952569169960474 },
  { listing_id: "1172140370078808736", search_views: 594, property_views: 146, booking_conversions: 0, search_to_view_rate: 0.24579124579124578, view_to_booking_rate: 0 },
  { listing_id: "1174006137271303122", search_views: 606, property_views: 77, booking_conversions: 0, search_to_view_rate: 0.12706270627062707, view_to_booking_rate: 0 },
  { listing_id: "1175211811818785379", search_views: 5203, property_views: 366, booking_conversions: 0, search_to_view_rate: 0.070344032289064, view_to_booking_rate: 0 },
  { listing_id: "1247599834613266855", search_views: 4995, property_views: 260, booking_conversions: 1, search_to_view_rate: 0.05205205205205205, view_to_booking_rate: 0.0038461538461538464 },
  { listing_id: "1277433630517357044", search_views: 192, property_views: 23, booking_conversions: 4, search_to_view_rate: 0.11979166666666667, view_to_booking_rate: 0.17391304347826086 },
  { listing_id: "1288239649379720848", search_views: 1677, property_views: 90, booking_conversions: 0, search_to_view_rate: 0.05366726296958855, view_to_booking_rate: 0 },
  { listing_id: "1289721832904643568", search_views: 822, property_views: 259, booking_conversions: 0, search_to_view_rate: 0.3150851581508516, view_to_booking_rate: 0 },
  { listing_id: "1295575837920024785", search_views: 4651, property_views: 198, booking_conversions: 0, search_to_view_rate: 0.042571490002150075, view_to_booking_rate: 0 },
  { listing_id: "1309976316951867073", search_views: 2701, property_views: 113, booking_conversions: 0, search_to_view_rate: 0.041836356904850054, view_to_booking_rate: 0 },
  { listing_id: "1310022327071563461", search_views: 2334, property_views: 220, booking_conversions: 0, search_to_view_rate: 0.09425878320479864, view_to_booking_rate: 0 },
  { listing_id: "1320482682181602577", search_views: 6609, property_views: 417, booking_conversions: 0, search_to_view_rate: 0.06309577848388562, view_to_booking_rate: 0 },
  { listing_id: "1325947572653903576", search_views: 293, property_views: 67, booking_conversions: 1, search_to_view_rate: 0.22866894197952217, view_to_booking_rate: 0.014925373134328358 },
  { listing_id: "1339703527804799550", search_views: 7851, property_views: 253, booking_conversions: 0, search_to_view_rate: 0.03222519424277162, view_to_booking_rate: 0 },
  { listing_id: "1339824939119223124", search_views: 971, property_views: 420, booking_conversions: 0, search_to_view_rate: 0.4325437693099897, view_to_booking_rate: 0 },
  { listing_id: "1341088473820921591", search_views: 358, property_views: 348, booking_conversions: 0, search_to_view_rate: 0.9720670391061452, view_to_booking_rate: 0 },
  { listing_id: "1357772448274126922", search_views: 430, property_views: 52, booking_conversions: 0, search_to_view_rate: 0.12093023255813953, view_to_booking_rate: 0 },
  { listing_id: "1384704061613121989", search_views: 0, property_views: 0, booking_conversions: 0, search_to_view_rate: 0, view_to_booking_rate: 0 },
  { listing_id: "1407082252509312531", search_views: 688, property_views: 139, booking_conversions: 4, search_to_view_rate: 0.20203488372093023, view_to_booking_rate: 0.02877697841726619 },
  { listing_id: "1427322486212619176", search_views: 4318, property_views: 238, booking_conversions: 2, search_to_view_rate: 0.05511811023622047, view_to_booking_rate: 0.008403361344537815 },
  { listing_id: "1445833430700201175", search_views: 197, property_views: 19, booking_conversions: 0, search_to_view_rate: 0.09644670050761421, view_to_booking_rate: 0 },
  { listing_id: "1590137712631990770", search_views: 2030, property_views: 240, booking_conversions: 0, search_to_view_rate: 0.11822660098522167, view_to_booking_rate: 0 },
  { listing_id: "1715763395157036279", search_views: 3762, property_views: 1115, booking_conversions: 2, search_to_view_rate: 0.29638490164805953, view_to_booking_rate: 0.0017937219730941704 },
  { listing_id: "1715783933278826776", search_views: 186, property_views: 257, booking_conversions: 3, search_to_view_rate: 1.381720430107527, view_to_booking_rate: 0.011673151750972763 },
  { listing_id: "882599984739548614", search_views: 2863, property_views: 337, booking_conversions: 4, search_to_view_rate: 0.11770869717079986, view_to_booking_rate: 0.011869436201780416 },
  { listing_id: "907785869402704341", search_views: 6282, property_views: 471, booking_conversions: 1, search_to_view_rate: 0.07497612225405921, view_to_booking_rate: 0.0021231422505307855 },
  { listing_id: "921635788498958884", search_views: 2531, property_views: 199, booking_conversions: 0, search_to_view_rate: 0.07862504938759383, view_to_booking_rate: 0 },
  { listing_id: "921663489922034551", search_views: 887, property_views: 35, booking_conversions: 0, search_to_view_rate: 0.03945885005636979, view_to_booking_rate: 0 },
  { listing_id: "992563175432177910", search_views: 1864, property_views: 227, booking_conversions: 0, search_to_view_rate: 0.12178111587982833, view_to_booking_rate: 0 },
] as const;

export const MDV_AIRBNB_RANKING_AS_OF = "2026-08-06";

// 2GIS public reviews API — the same endpoint that powers 2GIS website widgets.
// Read-only: official replies are posted via the 2GIS Business cabinet.
const KEY = '6e7e1929-4ea9-4a5d-8c05-d601860389bd';

export const REVIEW_BRANCHES = {
  '4YOU':    '70000001105005291',
  'COLIBRI': '70000001085349944',
  'VILLA':   '70000001102000129',
  // 'NURLY ORDA': пока нет карточки в 2ГИС
};

export const REVIEW_CLUB_URLS = {
  '4YOU':    'https://2gis.kz/almaty/firm/70000001105005291/tab/reviews',
  'COLIBRI': 'https://2gis.kz/almaty/firm/70000001085349944/tab/reviews',
  'VILLA':   'https://2gis.kz/almaty/firm/70000001102000129/tab/reviews',
};

/** Fetch reviews page. Returns { meta: {rating, count}, reviews: [...], nextLink } */
export async function fetchReviews(branchId, { limit = 20, nextLink = null } = {}) {
  const url = nextLink
    || `https://public-api.reviews.2gis.com/2.0/branches/${branchId}/reviews`
       + `?limit=${limit}&is_advertiser=false&fields=meta.branch_rating,meta.branch_reviews_count`
       + `&sort_by=date_edited&key=${KEY}&locale=ru_KZ`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`2GIS API: ${res.status}`);
  const json = await res.json();
  return {
    rating: json.meta?.branch_rating ?? null,
    count: json.meta?.branch_reviews_count ?? null,
    reviews: json.reviews || [],
    nextLink: json.meta?.next_link || null,
  };
}

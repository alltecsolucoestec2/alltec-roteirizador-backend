// Region ID verified in the geocoder's Rio de Janeiro address hierarchy.
export function rjQuery(text) {
  return new URLSearchParams({text, size: '20', 'boundary.country': 'BRA', 'boundary.gid': 'whosonfirst:region:85681991'});
}
export function inRioDeJaneiro(feature) {
  const p = feature?.properties;
  if (!p || !['BRA', 'BR'].includes(p.country_a?.toUpperCase())) return false;
  // Never infer the state from a street/city label or a rectangle overlapping neighbours.
  if (p.region_a) return p.region_a.toUpperCase() === 'RJ';
  return p.region_gid === 'whosonfirst:region:85681991' || p.region?.toLowerCase() === 'rio de janeiro';
}

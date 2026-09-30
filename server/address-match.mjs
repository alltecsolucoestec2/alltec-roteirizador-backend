const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ignored = new Set(['rua', 'r', 'avenida', 'av', 'estrada', 'rodovia', 'travessa', 'numero', 'n', 'bairro', 'cidade', 'estado', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'rj', 'br', 'bra', 'brasil', 'brazil']);
// Match every meaningful part of the request against actual returned address fields.
// Never promote a number typed/spoken by the user into a verified house number.
export function addressMatch(feature, input) {
  const p = feature.properties || {};
  const address = {
    street: p.street || '', number: String(p.housenumber || ''),
    neighbourhood: p.neighbourhood || p.borough || '',
    city: p.locality || p.localadmin || p.county || '', state: p.region_a || 'RJ'
  };
  const tokens = normalize(input).split(' ').filter(t => t && !ignored.has(t));
  const returned = new Set(normalize([p.street, p.housenumber, p.neighbourhood, p.borough, p.locality, p.localadmin, p.county, p.region].filter(Boolean).join(' ')).split(' '));
  const missing = tokens.filter(t => !returned.has(t));
  const issues = [];
  if (!address.number) issues.push('O serviço não localizou o número do imóvel.');
  if (!address.neighbourhood) issues.push('O serviço não confirmou o bairro.');
  if (!address.street) issues.push('O serviço não confirmou a rua.');
  if (!address.city) issues.push('O serviço não confirmou a cidade.');
  const requestedNumbers = tokens.filter(t => /^\d+[a-z]?$/.test(t));
  if (!requestedNumbers.length) issues.push('Confira e informe o número do imóvel em algarismos antes de adicionar.');
  else if (address.number && !requestedNumbers.includes(normalize(address.number))) issues.push('O número localizado é diferente do número informado.');
  if (missing.length) issues.push(`Partes do endereço informado não conferem com o resultado: ${[...new Set(missing)].join(', ')}.`);
  const label = [address.street && [address.street, address.number].filter(Boolean).join(', '), address.neighbourhood, address.city, address.state].filter(Boolean).join(' — ') || p.label;
  const selectable = issues.length === 0;
  return {label, input, address, selectable, issues, precision: selectable ? 'address' : 'approximate', point: {lng: feature.geometry?.coordinates?.[0], lat: feature.geometry?.coordinates?.[1]}};
}

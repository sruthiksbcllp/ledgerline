import React, { useEffect, useState, useMemo } from 'react';
import { Select, Space } from 'antd';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';

/**
 * Cascading asset picker: Property -> Location/Centre -> Asset.
 * Selecting a property narrows the location list; selecting a location narrows the asset list.
 * Shared across Movement / Disposal / QR / Add-Asset so the fix lands everywhere at once.
 *
 * Works as a Form.Item child: it receives `value` (asset id) + `onChange` from the form.
 * Extra prop `onSelect(assetId, assetObject)` fires when an asset is chosen (for side panels).
 */
export default function AssetPicker({ value, onChange, onSelect, disabled }) {
  const [properties, setProperties] = useState([]);
  const [locations, setLocations] = useState([]);
  const [assets, setAssets] = useState([]);
  const [propertyId, setPropertyId] = useState(undefined);
  const [locationId, setLocationId] = useState(undefined);

  useEffect(() => {
    (async () => {
      try {
        const [p, l, a] = await Promise.all([
          api.get('/masters/properties').catch(() => ({ data: [] })),
          api.get('/masters/locations').catch(() => ({ data: [] })),
          api.get('/assets', { params: { limit: 1000 } }).catch(() => ({ data: [] })),
        ]);
        setProperties(normalizeResponse(p));
        setLocations(normalizeResponse(l));
        const arows = a?.data?.assets || a?.data?.data?.rows || normalizeResponse(a);
        setAssets(Array.isArray(arows) ? arows : []);
      } catch { /* leave empty */ }
    })();
  }, []);

  const filteredLocations = useMemo(
    () => (propertyId ? locations.filter((l) => String(l.property_id) === String(propertyId)) : locations),
    [locations, propertyId]
  );
  const filteredAssets = useMemo(
    () => assets.filter((a) =>
      (!propertyId || String(a.property_id) === String(propertyId)) &&
      (!locationId || String(a.location_id) === String(locationId))
    ),
    [assets, propertyId, locationId]
  );
  const locName = (l) => l.location_name || l.location_code || `Location ${l.id}`;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      <Select
        allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} disabled={disabled}
        placeholder="1. Filter by Property"
        value={propertyId}
        onChange={(v) => { setPropertyId(v); setLocationId(undefined); }}
        options={properties.map((p) => ({ value: p.id, label: p.property_name || p.name }))}
      />
      <Select
        allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} disabled={disabled}
        placeholder="2. Filter by Location / Centre"
        value={locationId}
        onChange={(v) => setLocationId(v)}
        options={filteredLocations.map((l) => ({ value: l.id, label: locName(l) + (l.location_code && l.location_name ? ` (${l.location_code})` : '') }))}
      />
      <Select
        showSearch optionFilterProp="label" style={{ width: '100%' }} disabled={disabled}
        placeholder={`3. Select Asset${filteredAssets.length ? ` (${filteredAssets.length})` : ''}`}
        value={value}
        onChange={(v) => { onChange?.(v); onSelect?.(v, assets.find((a) => a.id === v)); }}
        options={filteredAssets.map((a) => ({
          value: a.id,
          label: `${a.asset_code || a.id} — ${a.asset_name || ''}${a.serial_number ? ` [${a.serial_number}]` : ''}`,
        }))}
        notFoundContent={assets.length ? 'No assets at this location' : 'Loading…'}
      />
    </Space>
  );
}

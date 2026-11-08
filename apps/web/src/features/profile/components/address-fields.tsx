"use client";

import { useMemo, useState } from "react";
import {
  getAllMunicipalities,
  getAllProvinces,
  getBarangaysByMunicipality,
  getMunicipalitiesByProvince,
  getPostalCodesByMunicipality,
} from "@aivangogh/ph-address";
import { inputClass } from "@/components/ui";

// Metro Manila's cities hang off the region, not a province: list them as one.
const ncrCode = "1300000000";
const ncr = { name: "Metro Manila (NCR)", psgcCode: ncrCode };

type Place = { name: string; psgcCode: string };

const byName = (a: Place, b: Place) => a.name.localeCompare(b.name);

function citiesOf(province: Place | undefined): Place[] {
  if (!province) return [];
  const list = province.psgcCode === ncrCode ? getAllMunicipalities().filter((m) => m.provinceCode === ncrCode) : getMunicipalitiesByProvince(province.psgcCode);
  return [...list].sort(byName);
}

// A select that keeps a saved value even when it isn't in the list (an address typed before these dropdowns existed).
function Select({ label, name, value, options, onChange, disabled, placeholder }: { label: string; name: string; value: string; options: string[]; onChange: (v: string) => void; disabled?: boolean; placeholder: string }) {
  const listed = value === "" || options.includes(value);
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <select name={name} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputClass}>
        <option value="">{placeholder}</option>
        {!listed && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {/* A disabled select sends nothing, so the form still gets the (empty) value. */}
      {disabled && <input type="hidden" name={name} value="" />}
    </label>
  );
}

// Province → city or municipality → barangay, each list narrowed by the one before it (PSGC data), and a zip code that
// fills in from the city's postal code and can still be typed over.
export function AddressFields({ initial }: { initial: { purok: string; province: string; city: string; barangay: string; zipCode: string } }) {
  const provinces = useMemo<Place[]>(() => [...getAllProvinces(), ncr].sort(byName), []);
  const [provinceName, setProvinceName] = useState(initial.province);
  const [cityName, setCityName] = useState(initial.city);
  const [barangay, setBarangay] = useState(initial.barangay);
  const [zip, setZip] = useState(initial.zipCode);

  const province = provinces.find((p) => p.name === provinceName);
  const cities = useMemo(() => citiesOf(province), [province]);
  const city = cities.find((c) => c.name === cityName);
  const barangays = useMemo(() => (city ? getBarangaysByMunicipality(city.psgcCode).map((b) => b.name) : []), [city]);
  const postal = useMemo(() => (city ? [...new Set(getPostalCodesByMunicipality(city.psgcCode).map((p) => p.postalCode))] : []), [city]);

  function pickProvince(name: string) {
    setProvinceName(name);
    setCityName("");
    setBarangay("");
    setZip("");
  }
  function pickCity(name: string) {
    setCityName(name);
    setBarangay("");
    const found = citiesOf(province).find((c) => c.name === name);
    setZip(found ? (getPostalCodesByMunicipality(found.psgcCode)[0]?.postalCode ?? "") : "");
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Purok / Sitio / Village / Subdivision</span>
        <input name="purok" defaultValue={initial.purok} className={inputClass} />
      </label>
      <Select label="Province" name="province" value={provinceName} options={provinces.map((p) => p.name)} onChange={pickProvince} placeholder="Select province" />
      <Select label="Municipality / City" name="city" value={cityName} options={cities.map((c) => c.name)} onChange={pickCity} disabled={!province && cityName === ""} placeholder={province ? "Select city or municipality" : "Select a province first"} />
      <Select label="Barangay" name="barangay" value={barangay} options={barangays} onChange={setBarangay} disabled={!city && barangay === ""} placeholder={city ? "Select barangay" : "Select a city first"} />
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Zip code</span>
        <input name="zipCode" value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" maxLength={10} list="zip-suggestions" className={inputClass} />
        <datalist id="zip-suggestions">
          {postal.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </label>
    </div>
  );
}

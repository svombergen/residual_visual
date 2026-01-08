// view-country.js
// Depends on: state, getFilteredData, DATA

window.renderCountryView = function renderCountryView() {
  const code = state.countryCode;
  const rows = getFilteredData().filter(r => r.country_code === code);

  const nameSpan = document.getElementById("country-name");
  const msg = document.getElementById("country-message");
  const tbody = document.getElementById("country-table-body");

  if (!nameSpan || !msg || !tbody) return;

  const displayCountry = rows[0]?.country || code || "";
  nameSpan.textContent = displayCountry;

  if (!rows.length) {
    msg.textContent = "There is currently no available data for the Residual Mix for this country.";
    tbody.innerHTML = "";
  } else {
    msg.textContent = "";
    tbody.innerHTML = rows.map(r =>
      `<tr>
         <td>${r.year}</td>
         <td>${r.energy_source}</td>
         <td>${r.certified_mix}</td>
         <td>${r.residual_mix}</td>
         <td>${r.emission_factor}</td>
       </tr>`
    ).join("");
  }

  const uniqueCountries = [...new Set(window.DATA.map(r => r.country_code))].sort();
  const nextBtn = document.getElementById("next-country-btn");
  if (!nextBtn) return;

  nextBtn.onclick = () => {
    if (!uniqueCountries.length) return;
    const idx = uniqueCountries.indexOf(code);
    const next = uniqueCountries[(idx + 1 + uniqueCountries.length) % uniqueCountries.length];
    location.hash = `#/country/${next}`;
  };
};

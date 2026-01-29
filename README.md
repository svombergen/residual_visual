# Residual Visual

Visualisation of certified and residual mix of energy sources for countries.

### Components:
- index.html: main visualization entrypoint
- test.html: tests iframe embedding
- data.js: static residual mix dataset
- main.js: routing, filters, view logic
- view-map.js: renders interactive world map
- view-list.js: renders horizontal list chart
- view-country.js: shows country detail view
- MultiSelect.js: dropdown enhancement library
- MultiSelect.css: styles for MultiSelect
- .cpanel.yml: deployment configuration file

### TODO:
- methodology pdfs, filter moet 1 kiezen
- download met duidelijke keuze voor jaar van data, meerdere metho selectie geeft meerdere tabs
- list view stylen
- integrate upload knop
- download data obv filters
- filters stylen
- data uit pdf 

+ kleur coding countries based on chosen key indicator
- default selectie: alle metho's, laatste jaar
- herkomst van data per country toevoegen
- show all values in country detail, no additional hidden 
- warning voor missing generation data

- nadenken over fullscreen, desktop en misschien mobilem no header no footer
- kleinere cirkel projectie, minus rusland en groenland, nadenken over background
- maybe zoom in to user region

### Vragen
- waarom geen nederland in data?
- hoe compare, of gewoon selected in list view?
- selectie voor compare ook in world view?
- kleuren categorisering bij world view?
- next country nuttig bij popup? alleen bij country detail page
- data toevoegen van andere compare websites? sowieso wat doen die andere sites anders?
- tracked % ipv untracked?
- tracked % key data
- mobile ?
- contact met website beheer

- beheer van data zou mooi zijn om zelf te kunnen
- aib-net.org heeft issuance, res mix data


### doel
- website heeft als doel leiden naar visual en data
- data download heel belangrijk, core scenario
- moet er belangirjk uitzien voor policy-makers

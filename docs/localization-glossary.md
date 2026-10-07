# Localization glossary

<!-- GENERATED FILE — do not edit by hand.
     Regenerate with: node tools/gen-localization-glossary.js
     Validation marks (☑) in the first column ARE preserved across runs. -->

**Generated** by `tools/gen-localization-glossary.js` on 2026-10-07. Re-run it after
touching a locale file or an inline `lbl()` string — every row below is derived, so a
hand edit will be overwritten. The one exception is the **Validé** column: it is human
review state and the generator carries existing `☑` marks forward, matching on the key
(locale rows) or on the EN string (inline rows).

Replace `☐` with `☑` when a native speaker has confirmed the FR and ES wording of a row.

## Where the strings live

| Source | Rows | Notes |
|---|---|---|
| `client/src/i18n/locales/{en,fr,es}.json` | 586 translated + 28 identical | Every kiosk-visible surface. 614 leaf keys total. |
| `client/src/components/ambient/SettingsPanel/index.js` | 106 (+4 non-literal, not listed) | Settings overlay — the user-facing configuration surface. |
| `client/src/components/ambient/DebugPanel/index.js` | 70 | Debug overlay — localhost-only, reached from a desktop browser or an SSH tunnel. |

Inline `lbl(lang, en, fr, es)` is a **codified exception** (see CLAUDE.md), permitted in
`SettingsPanel` and `DebugPanel` only — dense, maintainer-facing configuration surfaces
where keeping the three strings next to their usage beats locale-file indirection. It must
not spread to kiosk-visible surfaces, and never to alert content. **If a fourth language is
ever added, these are the rows that need a migration pass** — they are listed here in full
precisely so that job is scopeable.

## Coverage

✅ Every key in `en.json` has an `fr.json` and `es.json` counterpart, and neither file
carries a key `en.json` doesn't. (Checked at generation time — a mismatch would be
reported here as a gap table, so an empty check means the three files are aligned.)

---

# Locale files

## AI summary view (`aiView.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Overview | Aperçu | Resumen | `aiView.back` |
| ☐ | Generating summary… | Génération du résumé… | Generando el resumen… | `aiView.loading` |
| ☐ | Next period | Prochaine période | Próximo período | `aiView.nextPeriod` |
| ☐ | Now | Maintenant | Ahora | `aiView.now` |
| ☐ | This evening | Ce soir | Esta noche | `aiView.period.evening` |
| ☐ | Overnight | Cette nuit | Durante la noche | `aiView.period.overnight` |
| ☐ | Tomorrow | Demain | Mañana | `aiView.period.tomorrow` |
| ☐ | Radar analysis | Analyse radar | Análisis de radar | `aiView.radar` |
| ☐ | AI summary | Résumé IA | Resumen IA | `aiView.title` |
| ☐ | AI summary unavailable. | Résumé IA indisponible. | Resumen IA no disponible. | `aiView.unavailable` |

## Alert banner + severity (`alert.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | {{current}} / {{count}} active alert | {{current}} / {{count}} alerte active | {{current}} / {{count}} alerta activa | `alert.activeAlertsCount_one` |
| ☐ | {{current}} / {{count}} active alerts | {{current}} / {{count}} alertes actives | {{current}} / {{count}} alertas activas | `alert.activeAlertsCount_other` |
| ☐ | Air quality alert — {{value}} {{scale}}, {{level}}. Tap for details. | Alerte qualité de l'air — {{value}} {{scale}}, {{level}}. Toucher pour les détails. | Alerta de calidad del aire — {{value}} {{scale}}, {{level}}. Tocar para detalles. | `alert.airQualityAria` |
| ☐ | Collapse | Réduire | Contraer | `alert.collapse` |
| ☐ | Collapse the alert detail to see the map again | Réduire le détail de l'alerte pour revoir la carte | Contraer el detalle de la alerta para volver a ver el mapa | `alert.collapseAria` |
| ☐ | Tap to collapse | Toucher pour replier | Toque para replegar | `alert.collapseRow` |
| ☐ | Show the next alert | Afficher l'alerte suivante | Mostrar la siguiente alerta | `alert.cycleNextAria` |
| ☐ | Dismiss | Masquer | Ocultar | `alert.dismiss` |
| ☐ | Hide for 4 h (resurfaces if it escalates) | Masquer 4 h (réapparaît si ça s'aggrave) | Ocultar 4 h (reaparece si se agrava) | `alert.dismissTooltip` |
| ☐ | Tap to read detail | Toucher pour lire le détail | Toque para leer el detalle | `alert.expandRow` |
| ☐ | Expires {{when}} | Expire {{when}} | Expira {{when}} | `alert.expiresAt` |
| ☐ | Hide zone | Masquer la zone | Ocultar zona | `alert.hideOnMap` |
| ☐ | Hide the alert zone from the radar map | Masquer la zone d'alerte de la carte radar | Ocultar la zona de alerta del mapa de radar | `alert.hideOnMapAria` |
| ☐ | Issued {{days}}d ago | Émis il y a {{days}} j | Emitido hace {{days}} d | `alert.issuedDaysAgo` |
| ☐ | Issued {{hours}}h ago | Émis il y a {{hours}} h | Emitido hace {{hours}} h | `alert.issuedHoursAgo` |
| ☐ | Just issued | Émis à l'instant | Emitido ahora | `alert.issuedJustNow` |
| ☐ | Issued {{minutes}} min ago | Émis il y a {{minutes}} min | Emitido hace {{minutes}} min | `alert.issuedMinutesAgo` |
| ☐ | Heavy precipitation nearby | Précipitations fortes à proximité | Precipitación fuerte en las cercanías | `alert.orangeApproaching` |
| ☐ | Heavy precipitation appears to be approaching | Précipitations fortes qui semblent s'approcher | Precipitación fuerte parece estar acercándose | `alert.orangeApproachingHedged` |
| ☐ | Heavy precipitation drifting around you | Précipitations fortes en mouvement autour de vous | Precipitación fuerte desplazándose en su zona | `alert.orangeDrifting` |
| ☐ | Heavy precipitation intensifying | Précipitations fortes qui s'intensifient | Precipitación fuerte intensificándose | `alert.orangeIntensifying` |
| ☐ | Heavy precipitation moving away | Précipitations fortes mais s'éloignent | Precipitación fuerte alejándose | `alert.orangeLeaving` |
| ☐ | Heavy precipitation appears to be moving away | Précipitations fortes qui semblent s'éloigner | Precipitación fuerte parece estar alejándose | `alert.orangeLeavingHedged` |
| ☐ | Heavy precipitation in your area | Précipitations fortes sur votre zone | Precipitación fuerte en su zona | `alert.orangeNear` |
| ☐ | Alert — Severe precipitation approaching | Alerte — précipitations sévères approchent | Alerta — Precipitación severa acercándose | `alert.redApproaching` |
| ☐ | Severe precipitation appears to be approaching | Précipitations sévères qui semblent s'approcher | Precipitación severa parece estar acercándose | `alert.redApproachingHedged` |
| ☐ | Severe precipitation drifting around you | Précipitations sévères en mouvement autour de vous | Precipitación severa desplazándose en su zona | `alert.redDrifting` |
| ☐ | Alert — Severe precipitation intensifying | Alerte — précipitations sévères qui s'intensifient | Alerta — Precipitación severa intensificándose | `alert.redIntensifying` |
| ☐ | Severe precipitation moving away | Précipitations sévères mais s'éloignent | Precipitación severa alejándose | `alert.redLeaving` |
| ☐ | Severe precipitation appears to be moving away | Précipitations sévères qui semblent s'éloigner | Precipitación severa parece estar alejándose | `alert.redLeavingHedged` |
| ☐ | Alert — Severe precipitation in your area | Alerte — précipitations sévères sur votre zone | Alerta — Precipitación severa en su zona | `alert.redNear` |
| ☐ | Tap to show alerts you dismissed earlier | Toucher pour réafficher les alertes que vous avez masquées | Toque para volver a mostrar las alertas que ocultó | `alert.restoreDismissedAria` |
| ☐ | Restore {{count}} hidden alert | Restaurer {{count}} alerte masquée | Restaurar {{count}} alerta oculta | `alert.restoreDismissed_one` |
| ☐ | Restore {{count}} hidden alerts | Restaurer {{count}} alertes masquées | Restaurar {{count}} alertas ocultas | `alert.restoreDismissed_other` |
| ☐ | What to do | Mesures à prendre | Qué hacer | `alert.sectionAction` |
| ☐ | What's happening | Ce qui se passe | Lo que ocurre | `alert.sectionHazard` |
| ☐ | Possible impacts | Impacts possibles | Posibles impactos | `alert.sectionImpact` |
| ☐ | What was observed | Ce qui a été observé | Lo que se ha observado | `alert.sectionObservation` |
| ☐ | Data source | Source des données | Fuente de datos | `alert.sectionSource` |
| ☐ | When | Période | Periodo | `alert.sectionWhen` |
| ☐ | Affected areas | Zones affectées | Zonas afectadas | `alert.sectionWhere` |
| ☐ | Switch to this alert | Passer à cette alerte | Cambiar a esta alerta | `alert.selectAlertAria` |
| ☐ | Advisory | Avis | Aviso | `alert.severityAdvisory` |
| ☐ | Advisory | Avis | Aviso | `alert.severityAdvisoryShort` |
| ☐ | Emergency | Urgence | Emergencia | `alert.severityEmergency` |
| ☐ | Statement | Bulletin | Boletín | `alert.severityStatement` |
| ☐ | Statement | Bulletin | Boletín | `alert.severityStatementShort` |
| ☐ | Warning | Avertissement | Advertencia | `alert.severityWarning` |
| ☐ | Warning | Avert. | Advert. | `alert.severityWarningShort` |
| ☐ | Watch | Veille | Vigilancia | `alert.severityWatch` |
| ☐ | Watch | Veille | Vigil. | `alert.severityWatchShort` |
| ☐ | Show zone | Afficher la zone | Mostrar zona | `alert.showOnMap` |
| ☐ | Show the alert zone on the radar map | Afficher la zone d'alerte sur la carte radar | Mostrar la zona de alerta en el mapa de radar | `alert.showOnMapAria` |
| ☐ | tomorrow | demain | mañana | `alert.tomorrowShort` |
| ☐ | Also active | Aussi actives | También activas | `alert.view.alsoActive` |
| ☐ | Back to overview | Retour à l'aperçu | Volver al resumen | `alert.view.back` |
| ☐ | Open alert detail | Ouvrir le détail de l'alerte | Abrir el detalle de la alerta | `alert.view.openRow` |
| ☐ | Until {{time}} | Jusqu'à {{time}} | Hasta {{time}} | `alert.view.until` |

## Astronomy — moon phases + solar events (`astronomy.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Day length | Durée du jour | Duración del día | `astronomy.dayLength` |
| ☐ | First light | Aube civile | Aurora civil | `astronomy.firstLight` |
| ☐ | Last light | Crépuscule civil | Crepúsculo civil | `astronomy.lastLight` |
| ☐ | Moon | Lune | Luna | `astronomy.moonDetails` |
| ☐ | First quarter | Premier quartier | Cuarto creciente | `astronomy.moonPhase.firstQuarter` |
| ☐ | Full moon | Pleine lune | Luna llena | `astronomy.moonPhase.fullMoon` |
| ☐ | Last quarter | Dernier quartier | Cuarto menguante | `astronomy.moonPhase.lastQuarter` |
| ☐ | New moon | Nouvelle lune | Luna nueva | `astronomy.moonPhase.newMoon` |
| ☐ | Waning crescent | Dernier croissant | Menguante | `astronomy.moonPhase.waningCrescent` |
| ☐ | Waning gibbous | Gibbeuse décroissante | Gibosa menguante | `astronomy.moonPhase.waningGibbous` |
| ☐ | Waxing crescent | Premier croissant | Creciente | `astronomy.moonPhase.waxingCrescent` |
| ☐ | Waxing gibbous | Gibbeuse croissante | Gibosa creciente | `astronomy.moonPhase.waxingGibbous` |
| ☐ | Quarter | Quartier | Cuarto | `astronomy.moonPhaseShort.firstQuarter` |
| ☐ | Full moon | Pleine lune | Luna llena | `astronomy.moonPhaseShort.fullMoon` |
| ☐ | Quarter | Quartier | Cuarto | `astronomy.moonPhaseShort.lastQuarter` |
| ☐ | New moon | Nouvelle lune | Luna nueva | `astronomy.moonPhaseShort.newMoon` |
| ☐ | Crescent | Croissant | Menguante | `astronomy.moonPhaseShort.waningCrescent` |
| ☐ | Gibbous | Gibbeuse | Gibosa | `astronomy.moonPhaseShort.waningGibbous` |
| ☐ | Crescent | Croissant | Creciente | `astronomy.moonPhaseShort.waxingCrescent` |
| ☐ | Gibbous | Gibbeuse | Gibosa | `astronomy.moonPhaseShort.waxingGibbous` |
| ☐ | Moonrise | Lever de la lune | Salida de la luna | `astronomy.moonrise` |
| ☐ | Moonset | Coucher de la lune | Puesta de la luna | `astronomy.moonset` |
| ☐ | Next full moon | Prochaine pleine lune | Próxima luna llena | `astronomy.nextFullMoon` |
| ☐ | Next new moon | Prochaine nouvelle lune | Próxima luna nueva | `astronomy.nextNewMoon` |
| ☐ | Phase | Phase | Fase | `astronomy.phase` |
| ☐ | Seasons | Saisons | Estaciones | `astronomy.seasonsTitle` |
| ☐ | December solstice | Solstice de décembre | Solsticio de diciembre | `astronomy.solarEvent.decemberSolstice` |
| ☐ | June solstice | Solstice de juin | Solsticio de junio | `astronomy.solarEvent.juneSolstice` |
| ☐ | March equinox | Équinoxe de mars | Equinoccio de marzo | `astronomy.solarEvent.marchEquinox` |
| ☐ | September equinox | Équinoxe de septembre | Equinoccio de septiembre | `astronomy.solarEvent.septemberEquinox` |
| ☐ | in {{count}} days | dans {{count}} j | en {{count}} d | `astronomy.solarEventDays` |
| ☐ | in {{count}} day | dans {{count}} j | en {{count}} d | `astronomy.solarEventDays_one` |
| ☐ | in {{count}} days | dans {{count}} j | en {{count}} d | `astronomy.solarEventDays_other` |
| ☐ | {{event}} in {{count}} days | {{event}} dans {{count}} j | {{event}} en {{count}} d | `astronomy.solarEventIn` |
| ☐ | {{event}} in {{count}} day | {{event}} dans {{count}} j | {{event}} en {{count}} d | `astronomy.solarEventIn_one` |
| ☐ | {{event}} in {{count}} days | {{event}} dans {{count}} j | {{event}} en {{count}} d | `astronomy.solarEventIn_other` |
| ☐ | Equinox | Équinoxe | Equinoccio | `astronomy.solarEventShort.equinox` |
| ☐ | Solstice | Solstice | Solsticio | `astronomy.solarEventShort.solstice` |
| ☐ | Sun | Soleil | Sol | `astronomy.sunDetails` |
| ☐ | Sunrise | Lever | Amanecer | `astronomy.sunrise` |
| ☐ | Sunset | Coucher | Atardecer | `astronomy.sunset` |
| ☐ | Today | Aujourd'hui | Hoy | `astronomy.today` |
| ☐ | Tomorrow | Demain | Mañana | `astronomy.tomorrow` |

## Badges — UV / air quality / pollen (`badges.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | forecast | prévision | pronóstico | `badges.aqiKindForecast` |
| ☐ | observed | observé | observado | `badges.aqiKindObservation` |
| ☐ | High | Élevé | Alto | `badges.aqiLevel.high` |
| ☐ | Low risk | Risque faible | Riesgo bajo | `badges.aqiLevel.low` |
| ☐ | Moderate | Modéré | Moderado | `badges.aqiLevel.moderate` |
| ☐ | Very high | Très élevé | Muy alto | `badges.aqiLevel.veryHigh` |
| ☐ | Environment Canada AQHI | Cote air santé (Environnement Canada) | AQHI (Environment Canada) | `badges.aqiSourceEccc` |
| ☐ | Montreal RSQA IQA (city air-quality network) | IQA — RSQA Montréal (Ville) | IQA — RSQA Montreal | `badges.aqiSourceMelccMtl` |
| ☐ | Quebec MELCC IQA (RSQAQ provincial network) | IQA — MELCC Québec (RSQAQ) | IQA — MELCC Quebec (RSQAQ) | `badges.aqiSourceMelccRsqaq` |
| ☐ | Alder | Aulne | Aliso | `badges.pollenAllergens.alder_pollen` |
| ☐ | Birch | Bouleau | Abedul | `badges.pollenAllergens.birch_pollen` |
| ☐ | Grass | Graminées | Gramíneas | `badges.pollenAllergens.grass_pollen` |
| ☐ | Mugwort | Armoise | Artemisa | `badges.pollenAllergens.mugwort_pollen` |
| ☐ | Olive | Olivier | Olivo | `badges.pollenAllergens.olive_pollen` |
| ☐ | Ragweed | Herbe à poux | Ambrosía | `badges.pollenAllergens.ragweed_pollen` |
| ☐ | All exposure should be avoided. Unprotected skin can burn in minutes. | Toute exposition est à éviter. La peau non protégée peut brûler en quelques minutes. | Evite toda exposición. La piel desprotegida puede quemarse en minutos. | `badges.uvGuidance.extreme` |
| ☐ | Reduce time in the sun between 11 a.m. and 4 p.m. Sunscreen, hat, and sunglasses recommended. | Réduisez le temps au soleil entre 11 h et 16 h. Écran solaire, chapeau et lunettes recommandés. | Reduzca el tiempo al sol entre las 11 y las 16. Protector solar, sombrero y gafas recomendados. | `badges.uvGuidance.high` |
| ☐ | Minimal risk. No protection needed for most people. | Risque minimal. Aucune protection nécessaire pour la plupart des gens. | Riesgo mínimo. No se necesita protección para la mayoría. | `badges.uvGuidance.low` |
| ☐ | Wear sunglasses, use SPF 30+ sunscreen, seek shade near midday. | Portez des lunettes de soleil, appliquez un écran solaire FPS 30+, recherchez l'ombre près de midi. | Use gafas de sol, protector solar FPS 30+, busque sombra cerca del mediodía. | `badges.uvGuidance.moderate` |
| ☐ | Take extra precautions. Avoid the sun between 11 a.m. and 4 p.m., cover up, and apply SPF 30+ generously. | Précautions supplémentaires nécessaires. Évitez le soleil entre 11 h et 16 h, couvrez-vous, appliquez un FPS 30+ généreusement. | Precauciones adicionales necesarias. Evite el sol entre las 11 y las 16, cúbrase, aplique FPS 30+ generosamente. | `badges.uvGuidance.veryHigh` |
| ☐ | Extreme | Extrême | Extremo | `badges.uvLevel.extreme` |
| ☐ | High | Élevé | Alto | `badges.uvLevel.high` |
| ☐ | Low | Faible | Bajo | `badges.uvLevel.low` |
| ☐ | Moderate | Modéré | Moderado | `badges.uvLevel.moderate` |
| ☐ | Very high | Très élevé | Muy alto | `badges.uvLevel.veryHigh` |

## Charts / forecast tabs (`charts.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | 24 Hour Temp / Precipitation | Temp. 24 heures / Précipitations | Temp. 24 horas / Precipitaciones | `charts.24hourTemp` |
| ☐ | 24 Hour Wind Speed / Precipitation ({{unit}}) | Vent 24 heures / Précipitations ({{unit}}) | Viento 24 horas / Precipitaciones ({{unit}}) | `charts.24hourWind` |
| ☐ | 5 Day Temp / Precipitation | Temp. 5 jours / Précipitations | Temp. 5 días / Precipitaciones | `charts.5dayTemp` |
| ☐ | 5 Day Wind Speed / Precipitation ({{unit}}) | Vent 5 jours / Précipitations ({{unit}}) | Viento 5 días / Precipitaciones ({{unit}}) | `charts.5dayWind` |
| ☐ | Auto-selected | Sélection auto | Selección automática | `charts.autoSelected` |
| ☐ | probability | probabilité | probabilidad | `charts.legendProb` |
| ☐ | speed | vitesse | velocidad | `charts.legendSpeed` |
| ☐ | Maximize | Agrandir | Ampliar | `charts.maximize` |
| ☐ | Overlay precipitation on this chart | Superposer les précipitations sur ce graphique | Superponer la precipitación en este gráfico | `charts.overlayPrecip` |
| ☐ | 5 days | 5 jours | 5 días | `charts.period5d` |
| ☐ | avg | moy. | prom. | `charts.pillAvg` |
| ☐ | dominant | dominant | dominante | `charts.pillDominant` |
| ☐ | gusts | rafales | rachas | `charts.pillGusts` |
| ☐ | max | max | máx | `charts.pillMax` |
| ☐ | min | min | mín | `charts.pillMin` |
| ☐ | peak | pic | pico | `charts.pillPeak` |
| ☐ | low | creux | valle | `charts.pillTrough` |
| ☐ | Precipitation | Précipitations | Precipitaciones | `charts.precipitation` |
| ☐ | Restore | Restaurer | Restaurar | `charts.restore` |
| ☐ | Days | Jours | Días | `charts.tabDays` |
| ☐ | Hours | Heures | Horas | `charts.tabHours` |
| ☐ | Precip | Précip | Precip | `charts.tabPrecip` |
| ☐ | Wind | Vent | Viento | `charts.tabWind` |
| ☐ | Temp | Temp. | Temp. | `charts.temp` |
| ☐ | Forecast | Prévisions | Pronóstico | `charts.title` |
| ☐ | Wind | Vent | Viento | `charts.windSpeed` |

## Compass directions (`compass.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | NW | NO | NO | `compass.nw` |
| ☐ | SW | SO | SO | `compass.sw` |
| ☐ | W | O | O | `compass.w` |

## conditions (`conditions.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Overview | Aperçu | Resumen | `conditions.back` |
| ☐ | Open the conditions detail | Ouvrir le détail des conditions | Abrir el detalle de condiciones | `conditions.openAria` |
| ☐ | Conditions | Conditions | Condiciones | `conditions.title` |

## Controls / dock buttons (`controls.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Show rainfall · last hour | Afficher la pluie · dernière heure | Mostrar lluvia · última hora | `controls.accumToDAA` |
| ☐ | Rainfall: switch to storm total | Pluie : passer au total de l'épisode | Lluvia: cambiar a total de la tormenta | `controls.accumToDTA` |
| ☐ | Rainfall: switch to last 3 hours | Pluie : passer aux 3 dernières heures | Lluvia: cambiar a últimas 3 horas | `controls.accumToDU3` |
| ☐ | Hide rainfall totals | Masquer les cumuls de pluie | Ocultar acumulación de lluvia | `controls.accumToOff` |
| ☐ | Close debug panel | Fermer le panneau de débogage | Cerrar el panel de depuración | `controls.closeDebug` |
| ☐ | Close places | Fermer les lieux | Cerrar lugares | `controls.closePlaces` |
| ☐ | Close settings | Fermer les paramètres | Cerrar los ajustes | `controls.closeSettings` |
| ☐ | Close update modal | Fermer la fenêtre de mise à jour | Cerrar la ventana de actualización | `controls.closeUpdate` |
| ☐ | Show reflectivity | Afficher la réflectivité | Mostrar reflectividad | `controls.correlationOff` |
| ☐ | Show correlation coefficient | Afficher le coefficient de corrélation | Mostrar coeficiente de correlación | `controls.correlationOn` |
| ☐ | Switch to dark mode | Passer en mode sombre | Cambiar a modo oscuro | `controls.darkMode` |
| ☐ | Disable auto dark/light mode | Désactiver la bascule sombre/clair automatique | Desactivar alternancia oscuro/claro automática | `controls.disableAutoMode` |
| ☐ | Disable night-vision red palette | Désactiver la palette rouge | Desactivar paleta roja | `controls.disableNightRed` |
| ☐ | Hide radar analysis rings | Masquer les cercles d'analyse radar | Ocultar los círculos de análisis radar | `controls.disableRadarRings` |
| ☐ | Close controls | Fermer les commandes | Cerrar los controles | `controls.drawerClose` |
| ☐ | Controls | Commandes | Controles | `controls.drawerTitle` |
| ☐ | Enable auto dark/light mode | Activer la bascule sombre/clair automatique | Activar alternancia oscuro/claro automática | `controls.enableAutoMode` |
| ☐ | Enable night-vision red palette | Activer la palette rouge (vision nocturne) | Activar paleta roja (visión nocturna) | `controls.enableNightRed` |
| ☐ | Show radar analysis rings | Afficher les cercles d'analyse radar | Mostrar los círculos de análisis radar | `controls.enableRadarRings` |
| ☐ | Focus radar (hide panels) | Focus radar (masquer les panneaux) | Enfocar radar (ocultar paneles) | `controls.focusRadar` |
| ☐ | Display | Affichage | Visualización | `controls.groupDisplay` |
| ☐ | Map | Carte | Mapa | `controls.groupMap` |
| ☐ | System | Système | Sistema | `controls.groupSystem` |
| ☐ | Views | Vues | Vistas | `controls.groupViews` |
| ☐ | Hide AI summary section | Masquer la section IA | Ocultar la sección de IA | `controls.hideAiSummary` |
| ☐ | Hide lightning | Masquer la foudre | Ocultar rayos | `controls.hideLightning` |
| ☐ | Hide location marker | Masquer le marqueur de position | Ocultar el marcador de ubicación | `controls.hideMarker` |
| ☐ | Hide nearby alerts | Masquer les alertes à proximité | Ocultar alertas cercanas | `controls.hideNearbyAlerts` |
| ☐ | Hide nowcast | Masquer la prévision immédiate | Ocultar pronóstico inmediato | `controls.hideNowcast` |
| ☐ | Hide radar | Masquer le radar | Ocultar radar | `controls.hideRadar` |
| ☐ | Hide radar legend | Masquer la légende radar | Ocultar leyenda del radar | `controls.hideRadarLegend` |
| ☐ | Hide radar sites | Masquer les sites radar | Ocultar sitios de radar | `controls.hideRadarSites` |
| ☐ | Hide toolbar | Masquer la barre | Ocultar la barra | `controls.hideRail` |
| ☐ | Hide storm tracks | Masquer les trajectoires d'orage | Ocultar trayectorias de tormenta | `controls.hideStormTracks` |
| ☐ | Hide timeline | Masquer la chronologie | Ocultar la línea de tiempo | `controls.hideTimeline` |
| ☐ | Switch to light mode | Passer en mode clair | Cambiar a modo claro | `controls.lightMode` |
| ☐ | Could not get your location | Position introuvable | No se pudo obtener tu ubicación | `controls.locateFailed` |
| ☐ | Centre on my location | Centrer sur ma position | Centrar en mi ubicación | `controls.locateMe` |
| ☐ | Finding your location | Recherche de votre position | Buscando tu ubicación | `controls.locating` |
| ☐ | Also remove insects, birds and clutter | Retirer aussi insectes, oiseaux et échos de sol | Quitar también insectos, aves y eco de suelo | `controls.noiseFilterToClean` |
| ☐ | Filter clear-air noise | Filtrer le bruit en air clair | Filtrar ruido de aire claro | `controls.noiseFilterToDbz` |
| ☐ | Show clear-air returns | Afficher les échos en air clair | Mostrar ecos de aire claro | `controls.noiseFilterToOff` |
| ☐ | Open AI summary | Ouvrir le résumé IA | Abrir el resumen IA | `controls.openAiView` |
| ☐ | Open debug panel | Ouvrir le panneau de débogage | Abrir el panel de depuración | `controls.openDebug` |
| ☐ | Open forecast | Ouvrir les prévisions | Abrir el pronóstico | `controls.openForecast` |
| ☐ | Open places | Ouvrir les lieux | Abrir lugares | `controls.openPlaces` |
| ☐ | Open settings | Ouvrir les paramètres | Abrir los ajustes | `controls.openSettings` |
| ☐ | Show update modal | Afficher la fenêtre de mise à jour | Mostrar la ventana de actualización | `controls.openUpdate` |
| ☐ | Show reflectivity | Afficher la réflectivité | Mostrar reflectividad | `controls.precipTypeOff` |
| ☐ | Show precipitation type | Afficher le type de précipitations | Mostrar tipo de precipitación | `controls.precipTypeOn` |
| ☐ | Expand the radar first to use this control | Agrandissez d'abord le radar pour utiliser ce contrôle | Amplíe primero el radar para usar este control | `controls.radarOverlaysNeedMaximize` |
| ☐ | Re-center here | Recentrer ici | Recentrar aquí | `controls.recenterHere` |
| ☐ | Refresh app | Rafraîchir l'application | Actualizar la aplicación | `controls.refreshApp` |
| ☐ | Recenter the map on the home position | Recentrer la carte sur la position de départ | Recentrar el mapa en la posición inicial | `controls.resetMapPosition` |
| ☐ | Restore panels | Restaurer les panneaux | Restaurar paneles | `controls.restorePanels` |
| ☐ | Show satellite (infrared) | Afficher le satellite (infrarouge) | Mostrar satélite (infrarrojo) | `controls.satelliteToIr` |
| ☐ | Satellite: switch to color infrared | Satellite : passer à l’infrarouge en couleur | Satélite: cambiar a infrarrojo en color | `controls.satelliteToIrColor` |
| ☐ | Hide satellite | Masquer le satellite | Ocultar satélite | `controls.satelliteToOff` |
| ☐ | Satellite: switch to visible | Satellite : passer au visible | Satélite: cambiar a visible | `controls.satelliteToVis` |
| ☐ | Show AI summary section | Afficher la section IA | Mostrar la sección de IA | `controls.showAiSummary` |
| ☐ | Show lightning | Afficher la foudre | Mostrar rayos | `controls.showLightning` |
| ☐ | Show location marker | Afficher le marqueur de position | Mostrar el marcador de ubicación | `controls.showMarker` |
| ☐ | Show nearby alerts | Afficher les alertes à proximité | Mostrar alertas cercanas | `controls.showNearbyAlerts` |
| ☐ | Show nowcast | Afficher la prévision immédiate | Mostrar pronóstico inmediato | `controls.showNowcast` |
| ☐ | Show radar | Afficher le radar | Mostrar radar | `controls.showRadar` |
| ☐ | Show radar legend | Afficher la légende radar | Mostrar leyenda del radar | `controls.showRadarLegend` |
| ☐ | Show radar sites | Afficher les sites radar | Mostrar sitios de radar | `controls.showRadarSites` |
| ☐ | Show toolbar | Afficher la barre | Mostrar la barra | `controls.showRail` |
| ☐ | Show storm tracks | Afficher les trajectoires d'orage | Mostrar trayectorias de tormenta | `controls.showStormTracks` |
| ☐ | Show timeline | Afficher la chronologie | Mostrar la línea de tiempo | `controls.showTimeline` |
| ☐ | Follow my location | Suivre ma position | Seguir mi ubicación | `controls.startFollow` |
| ☐ | Stop following my location | Arrêter de suivre ma position | Dejar de seguir mi ubicación | `controls.stopFollow` |
| ☐ | Update available — connect locally to install | Mise à jour disponible — connectez-vous en local pour installer | Actualización disponible — conéctese en local para instalar | `controls.updateAvailableRemote` |
| ☐ | Show reflectivity | Afficher la réflectivité | Mostrar reflectividad | `controls.velocityOff` |
| ☐ | Show base velocity | Afficher la vitesse radiale | Mostrar velocidad radial | `controls.velocityOn` |

## dateFormat (`dateFormat.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | cccc LLLL d | cccc d LLLL | cccc d 'de' LLLL | `dateFormat` |

## Debug panel — chrome (`debug.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | LOADING... | CHARGEMENT... | CARGANDO... | `debug.loading` |
| ☐ | REFRESH | ACTUALISER | ACTUALIZAR | `debug.refresh` |
| ☐ | DEBUG | DÉBOGAGE | DEPURACIÓN | `debug.title` |

## Errors / loading states (`errors.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Cannot get 5 day weather forecast | Impossible d'obtenir les prévisions sur 5 jours | No se pueden obtener los pronósticos de 5 días | `errors.dailyForecastFailed` |
| ☐ | Cannot get 24 hour weather forecast | Impossible d'obtenir les prévisions sur 24 heures | No se pueden obtener los pronósticos de 24 horas | `errors.hourlyForecastFailed` |

## favorites (`favorites.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Done | Terminé | Hecho | `favorites.done` |
| ☐ | Edit | Modifier | Modificar | `favorites.edit` |
| ☐ | Open a place on the map, tap its name, then “Pin this place”. | Ouvrez un lieu sur la carte, touchez son nom, puis « Épingler ce lieu ». | Abra un lugar en el mapa, toque su nombre y luego «Anclar este lugar». | `favorites.empty` |
| ☐ | List full — remove one first | Liste pleine — retirez-en un | Lista llena — quite uno | `favorites.full` |
| ☐ | Home position | Position de départ | Posición inicial | `favorites.homeFallback` |
| ☐ | Default | Par défaut | Por defecto | `favorites.isDefault` |
| ☐ | Pin this place | Épingler ce lieu | Anclar este lugar | `favorites.pin` |
| ☐ | Pinned | Épinglé | Anclado | `favorites.pinned` |
| ☐ | Editing requires local access. | La modification exige un accès local. | La edición requiere acceso local. | `favorites.remoteReadOnly` |
| ☐ | Remove | Retirer | Quitar | `favorites.remove` |
| ☐ | Remove? | Retirer ? | ¿Quitar? | `favorites.removeConfirm` |
| ☐ | Rename | Renommer | Renombrar | `favorites.rename` |
| ☐ | Enter to save, Esc to cancel | Entrée pour enregistrer, Échap pour annuler | Intro para guardar, Esc para cancelar | `favorites.renameHint` |
| ☐ | Could not save — check the connection | Enregistrement impossible — vérifiez la connexion | No se pudo guardar — revise la conexión | `favorites.saveFailed` |
| ☐ | Set as default | Définir par défaut | Definir por defecto | `favorites.setDefault` |
| ☐ | Places | Lieux | Lugares | `favorites.title` |

## Gov't alert detail (`govAlertDetail.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | No additional detail provided for this alert. | Aucun détail additionnel fourni pour cette alerte. | No se proporcionó detalle adicional para esta alerta. | `govAlertDetail.noDetail` |
| ☐ | Scan to open on your phone | Scannez pour ouvrir sur votre téléphone | Escanee para abrir en su teléfono | `govAlertDetail.qrCaption` |

## Service health indicator (`health.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | All services OK | Tous les services fonctionnent | Todos los servicios funcionan | `health.allOk` |
| ☐ | Services | Services | Servicios | `health.chipPrefix` |
| ☐ | A critical service is down | Un service critique est en panne | Un servicio crítico está caído | `health.criticalDown` |
| ☐ | Some non-critical services degraded | Certains services non critiques sont dégradés | Algunos servicios no críticos están degradados | `health.degraded` |
| ☐ | Nothing to report. | Rien à signaler. | Nada que reportar. | `health.noIssues` |
| ☐ | GitHub (updates) | GitHub (mises à jour) | GitHub (actualizaciones) | `health.provider.github` |
| ☐ | Major outage | Panne majeure | Interrupción mayor | `health.providerIndicator.critical` |
| ☐ | Under maintenance | En maintenance | En mantenimiento | `health.providerIndicator.maintenance` |
| ☐ | Partial outage | Panne partielle | Interrupción parcial | `health.providerIndicator.major` |
| ☐ | Degraded performance | Performance dégradée | Rendimiento degradado | `health.providerIndicator.minor` |
| ☐ | Operational | Opérationnel | Operacional | `health.providerIndicator.none` |
| ☐ | Unknown | État inconnu | Desconocido | `health.providerIndicator.unknown` |
| ☐ | Upstream services | Services en amont | Servicios externos | `health.providerStatusHeader` |
| ☐ | Server unreachable | Serveur injoignable | Servidor inaccesible | `health.serverUnreachable` |
| ☐ | Critical | Critique | Crítico | `health.shortCritical` |
| ☐ | Degraded | Dégradé | Degradado | `health.shortDegraded` |
| ☐ | Offline | Hors ligne | Sin conexión | `health.shortOffline` |
| ☐ | Service health | État des services | Estado de los servicios | `health.title` |

## Indoor temperature (`indoor.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Excellent | Excellente | Excelente | `indoor.airQuality.1` |
| ☐ | Good | Bonne | Buena | `indoor.airQuality.2` |
| ☐ | Fair | Moyenne | Aceptable | `indoor.airQuality.3` |
| ☐ | Inferior | Mauvaise | Mala | `indoor.airQuality.4` |
| ☐ | Poor | Très mauvaise | Muy mala | `indoor.airQuality.5` |
| ☐ | INDOOR | INTÉRIEUR | INTERIOR | `indoor.label` |

## location (`location.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Coordinates | Coordonnées | Coordenadas | `location.coordinates` |
| ☐ | Country | Pays | País | `location.country` |
| ☐ | County | Comté / MRC | Condado | `location.county` |
| ☐ | Location | Lieu | Ubicación | `location.details` |
| ☐ | Neighbourhood | Quartier | Barrio | `location.district` |
| ☐ | City | Ville | Ciudad | `location.locality` |
| ☐ | No address found at this point. | Aucune adresse trouvée à ce point. | No se encontró una dirección en este punto. | `location.noAddress` |
| ☐ | Postal code | Code postal | Código postal | `location.postcode` |
| ☐ | State / Region | Province / Région | Estado / Región | `location.region` |
| ☐ | Source: LocationIQ | Source : LocationIQ | Fuente: LocationIQ | `location.source` |

## map (`map.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Finding your location… | Recherche de votre position… | Buscando tu ubicación… | `map.locating` |
| ☐ | Allow location access to centre the radar | Autorisez la localisation pour centrer le radar | Permite el acceso a la ubicación para centrar el radar | `map.locatingHint` |

## Metrics grid (`metrics.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | AQI | IQA | ICA | `metrics.aqi` |
| ☐ | Reading age | Âge de la lecture | Antigüedad de la lectura | `metrics.detailAge` |
| ☐ | All allergens | Tous les allergènes | Todos los alérgenos | `metrics.detailAllergens` |
| ☐ | Reading type | Type de lecture | Tipo de lectura | `metrics.detailKind` |
| ☐ | Pollutant | Polluant | Contaminante | `metrics.detailPollutant` |
| ☐ | Source | Source | Fuente | `metrics.detailSource` |
| ☐ | Station | Station | Estación | `metrics.detailStation` |
| ☐ | Value | Valeur | Valor | `metrics.detailValue` |
| ☐ | Highest | Plus élevé | Máximo | `metrics.detailWorst` |
| ☐ | Gust | Rafales | Ráfagas | `metrics.gust` |
| ☐ | Humidity | Humidité | Humedad | `metrics.humidity` |
| ☐ | Pollen | Pollen | Polen | `metrics.pollen` |
| ☐ | Pressure | Pression | Presión | `metrics.pressure` |
| ☐ | Visibility | Visibilité | Visibilidad | `metrics.visibility` |
| ☐ | Wind | Vent | Viento | `metrics.wind` |

## Nowcast line (`nowcast.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Nowcast: {{headline}} | Prévision immédiate : {{headline}} | Pronóstico inmediato: {{headline}} | `nowcast.aria` |
| ☐ | Brief graupel in {{range}} min | Neige roulée brève dans {{range}} min | Nieve granulada breve en {{range}} min | `nowcast.brief.graupel` |
| ☐ | Brief hail in {{range}} min | Grêle brève dans {{range}} min | Granizo breve en {{range}} min | `nowcast.brief.hail` |
| ☐ | Brief sleet in {{range}} min | Grésil bref dans {{range}} min | Aguanieve breve en {{range}} min | `nowcast.brief.mix` |
| ☐ | Brief shower in {{range}} min | Averse brève dans {{range}} min | Chubasco breve en {{range}} min | `nowcast.brief.rain` |
| ☐ | Brief snow shower in {{range}} min | Averse de neige brève dans {{range}} min | Nevada breve en {{range}} min | `nowcast.brief.snow` |
| ☐ | Storm cell {{id}} on track · ≈{{min}} min | Cellule {{id}} en approche · ≈{{min}} min | Célula {{id}} en rumbo · ≈{{min}} min | `nowcast.cellOnTrack` |
| ☐ | Storm cell {{id}} overhead | Cellule {{id}} au-dessus | Célula {{id}} encima | `nowcast.cellOverhead` |
| ☐ | {{pct}}% chance | {{pct}} % de chances | {{pct}}% de probabilidad | `nowcast.chance` |
| ☐ | high confidence | confiance élevée | confianza alta | `nowcast.confidence.high` |
| ☐ | low confidence | confiance faible | confianza baja | `nowcast.confidence.low` |
| ☐ | medium confidence | confiance moyenne | confianza media | `nowcast.confidence.medium` |
| ☐ | motion unknown | mouvement inconnu | movimiento desconocido | `nowcast.confidence.unknown` |
| ☐ | ending around {{time}} | fin vers {{time}} | termina hacia las {{time}} | `nowcast.endsAround` |
| ☐ | Rain {{dist}} to the {{dir}} is not heading this way | La pluie à {{dist}} au {{dir}} ne se dirige pas vers ici | La lluvia a {{dist}} al {{dir}} no viene hacia aquí | `nowcast.farRainAway` |
| ☐ | Rain {{dist}} to the {{dir}} is heading this way · about {{eta}} out | La pluie à {{dist}} au {{dir}} se dirige vers ici · à environ {{eta}} | Lluvia a {{dist}} al {{dir}} viene hacia aquí · a unos {{eta}} | `nowcast.farRainClosing` |
| ☐ | Rain {{dist}} to the {{dir}} · too little echo within {{core}} to track it | Pluie à {{dist}} au {{dir}} · trop peu d'écho à moins de {{core}} pour la suivre | Lluvia a {{dist}} al {{dir}} · demasiado poco eco en {{core}} para seguirla | `nowcast.farRainUntracked` |
| ☐ | waiting for a second scan | en attente d'un second balayage | esperando un segundo barrido | `nowcast.firstScan` |
| ☐ | Beyond {{min}} min the rain would come from outside the radar's view | Au-delà de {{min}} min la pluie viendrait de hors de portée du radar | Más allá de {{min}} min la lluvia vendría de fuera del alcance del radar | `nowcast.horizonShort` |
| ☐ | Graupel in {{range}} min | Neige roulée dans {{range}} min | Nieve granulada en {{range}} min | `nowcast.in.graupel` |
| ☐ | Hail in {{range}} min | Grêle dans {{range}} min | Granizo en {{range}} min | `nowcast.in.hail` |
| ☐ | Sleet or freezing rain in {{range}} min | Verglas ou grésil dans {{range}} min | Aguanieve o lluvia helada en {{range}} min | `nowcast.in.mix` |
| ☐ | Rain in {{range}} min | Pluie dans {{range}} min | Lluvia en {{range}} min | `nowcast.in.rain` |
| ☐ | Snow in {{range}} min | Neige dans {{range}} min | Nieve en {{range}} min | `nowcast.in.snow` |
| ☐ | heavy | forte | fuerte | `nowcast.intensity.heavy` |
| ☐ | intense | très forte | muy fuerte | `nowcast.intensity.intense` |
| ☐ | light | faible | ligera | `nowcast.intensity.light` |
| ☐ | moderate | modérée | moderada | `nowcast.intensity.moderate` |
| ☐ | no rain | pas de pluie | sin lluvia | `nowcast.intensity.none` |
| ☐ | Here: {{right}}% of {{lead}}-min rain calls came true ({{n}} checked) | Ici : {{right}} % des annonces à {{lead}} min se sont vérifiées ({{n}} contrôlées) | Aquí: el {{right}}% de los avisos a {{lead}} min se cumplieron ({{n}} comprobados) | `nowcast.liveSkill` |
| ☐ | Scored live at this location: every call is checked against the radar scan that arrives {{lead}} min later. | Vérifié en direct à cet endroit : chaque annonce est contrôlée avec le balayage qui arrive {{lead}} min plus tard. | Verificado en vivo en este lugar: cada aviso se comprueba con el barrido que llega {{lead}} min después. | `nowcast.liveSkillHint` |
| ☐ | Reading the radar… | Lecture du radar… | Leyendo el radar… | `nowcast.loading` |
| ☐ | Rain nearby, motion unclear | Pluie à proximité, mouvement incertain | Lluvia cerca, movimiento incierto | `nowcast.motionUnknown` |
| ☐ | Rain within {{dist}}, but the scans do not agree on how it is moving | Pluie à moins de {{dist}}, mais les balayages ne s'accordent pas sur son mouvement | Hay lluvia en {{dist}}, pero los barridos no coinciden en su movimiento | `nowcast.motionUnknownDetail` |
| ☐ | Moving {{speed}} from the {{dir}} | Se déplace à {{speed}} depuis le {{dir}} | Se mueve a {{speed}} desde el {{dir}} | `nowcast.moving` |
| ☐ | A small shower {{dist}} to the {{dir}} ({{dbz}} dBZ) is not on a path over the pin | Une petite averse à {{dist}} au {{dir}} ({{dbz}} dBZ) ne passe pas sur le repère | Un chubasco pequeño a {{dist}} al {{dir}} ({{dbz}} dBZ) no pasa sobre el punto | `nowcast.nearbyEcho` |
| ☐ | Only light echo nearby ({{dist}} to the {{dir}}, {{dbz}} dBZ) — below the 15 dBZ rain threshold | Seulement un écho faible à proximité ({{dist}} au {{dir}}, {{dbz}} dBZ), sous le seuil de pluie de 15 dBZ | Solo eco débil cerca ({{dist}} al {{dir}}, {{dbz}} dBZ), por debajo del umbral de lluvia de 15 dBZ | `nowcast.nearbyLightEcho` |
| ☐ | still raining at {{time}} | pleut encore à {{time}} | sigue lloviendo a las {{time}} | `nowcast.noEnd` |
| ☐ | No rain expected in the next {{min}} min | Pas de pluie prévue dans les {{min}} prochaines min | Sin lluvia prevista en los próximos {{min}} min | `nowcast.noRain` |
| ☐ | No rain echo within {{dist}} is heading this way | Aucun écho de pluie à moins de {{dist}} ne se dirige vers ici | Ningún eco de lluvia en {{dist}} viene hacia aquí | `nowcast.noRainDetail` |
| ☐ | No recent scans from {{site}} | Aucun balayage récent de {{site}} | Sin barridos recientes de {{site}} | `nowcast.noScans` |
| ☐ | Graupel now | Neige roulée en cours | Nieve granulada ahora | `nowcast.now.graupel` |
| ☐ | Hail now | Grêle en cours | Granizo ahora | `nowcast.now.hail` |
| ☐ | Sleet or freezing rain now | Verglas ou grésil en cours | Aguanieve o lluvia helada ahora | `nowcast.now.mix` |
| ☐ | Raining now | Il pleut | Lloviendo ahora | `nowcast.now.rain` |
| ☐ | Snowing now | Il neige | Nevando ahora | `nowcast.now.snow` |
| ☐ | now | maint. | ahora | `nowcast.nowTick` |
| ☐ | {{intensity}} around {{time}} | {{intensity}} vers {{time}} | {{intensity}} hacia las {{time}} | `nowcast.peakAt` |
| ☐ | Raining now | Il pleut | Lloviendo ahora | `nowcast.rainingNow` |
| ☐ | about {{rate}} | environ {{rate}} | unos {{rate}} | `nowcast.rate` |
| ☐ | Track record: {{right}}% of {{lead}}-min rain calls came true | Bilan : {{right}} % des annonces de pluie à {{lead}} min se sont vérifiées | Historial: el {{right}}% de los avisos de lluvia a {{lead}} min se cumplieron | `nowcast.skill` |
| ☐ | Measured against archived radar scans. When the card said rain would arrive in about {{lead}} min, it did {{right}}% of the time; it also missed {{missed}}% of the rain that did come. | Mesuré sur des balayages radar archivés. Quand la carte annonçait de la pluie dans environ {{lead}} min, elle est arrivée {{right}} % du temps ; elle a aussi manqué {{missed}} % de la pluie survenue. | Medido con barridos de radar archivados. Cuando la tarjeta anunció lluvia en unos {{lead}} min, llegó el {{right}}% de las veces; además no avisó del {{missed}}% de la lluvia que sí llegó. | `nowcast.skillHint` |
| ☐ | Up to a {{pct}}% chance around {{time}} | Jusqu'à {{pct}} % de chances vers {{time}} | Hasta un {{pct}}% de probabilidad hacia las {{time}} | `nowcast.someChance` |
| ☐ | Nearly stationary | Quasi stationnaire | Casi estacionaria | `nowcast.stationary` |
| ☐ | Expected rain intensity over the next {{min}} minutes | Intensité de pluie prévue sur les {{min}} prochaines minutes | Intensidad de lluvia prevista en los próximos {{min}} minutos | `nowcast.stripAria` |
| ☐ | Nowcast | Prévision immédiate | Pronóstico inmediato | `nowcast.title` |
| ☐ | weakening | en affaiblissement | debilitándose | `nowcast.trend.decaying` |
| ☐ | building | en renforcement | intensificándose | `nowcast.trend.growing` |
| ☐ | The radar feed did not answer — it will retry in a minute | Le radar n'a pas répondu ; nouvel essai dans une minute | El radar no respondió; se reintentará en un minuto | `nowcast.tryLater` |
| ☐ | Nowcast unavailable | Prévision immédiate indisponible | Pronóstico inmediato no disponible | `nowcast.unavailable` |
| ☐ | surface radar agrees | le radar de surface confirme | el radar de superficie coincide | `nowcast.withSurface` |

## Radar — legend + timeline (`radar.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | {{count}} min ago | il y a {{count}} min | hace {{count}} min | `radar.ageMinutes_one` |
| ☐ | {{count}} min ago | il y a {{count}} min | hace {{count}} min | `radar.ageMinutes_other` |
| ☐ | Mosaic | Mosaïque | Mosaico | `radar.ageMosaic` |
| ☐ | Mosaic · IEM | Mosaïque · IEM | Mosaico · IEM | `radar.ageMosaicIem` |
| ☐ | Type mosaic | Mosaïque de type | Mosaico de tipo | `radar.ageMosaicPrecip` |
| ☐ | now | maintenant | ahora | `radar.ageNow` |
| ☐ | TYPE | TYPE | TIPO | `radar.agePrecipType` |
| ☐ | Radar frame list is not refreshing | La liste des images radar ne s'actualise plus | La lista de imágenes de radar no se está actualizando | `radar.ageRefreshFailing` |
| ☐ | Satellite IR | Satellite IR | Satélite IR | `radar.ageSatelliteIr` |
| ☐ | Satellite VIS | Satellite VIS | Satélite VIS | `radar.ageSatelliteVis` |
| ☐ | Tracks | Cellules | Células | `radar.ageTracks` |
| ☐ | VEL | VIT | VEL | `radar.ageVelocity` |
| ☐ | Reaches home in {{lead}} · passes {{dist}} away | Arrive ici dans {{lead}} · passe à {{dist}} | Llega aquí en {{lead}} · pasa a {{dist}} | `radar.cellArrival` |
| ☐ | Hail (MRMS MESH): {{size}} | Grêle (MRMS MESH) : {{size}} | Granizo (MRMS MESH): {{size}} | `radar.cellHail` |
| ☐ | Hail (MRMS MESH): none detected | Grêle (MRMS MESH) : aucune détectée | Granizo (MRMS MESH): no detectado | `radar.cellHailNone` |
| ☐ | Hail (MRMS MESH): {{size}} now · {{peak}} peak in 30 min | Grêle (MRMS MESH) : {{size}} maintenant · max {{peak}} sur 30 min | Granizo (MRMS MESH): {{size}} ahora · máx {{peak}} en 30 min | `radar.cellHailPeak` |
| ☐ | Hail (MRMS MESH): none now · {{peak}} peak in 30 min | Grêle (MRMS MESH) : aucune maintenant · max {{peak}} sur 30 min | Granizo (MRMS MESH): ninguno ahora · máx {{peak}} en 30 min | `radar.cellHailPeakOnly` |
| ☐ | hail {{size}} | grêle {{size}} | granizo {{size}} | `radar.cellHailShort` |
| ☐ | Hail (MRMS MESH): unavailable | Grêle (MRMS MESH) : indisponible | Granizo (MRMS MESH): no disponible | `radar.cellHailUnavailable` |
| ☐ | Moving {{dir}} at {{speed}} | Se déplace vers {{dir}} à {{speed}} | Se mueve hacia {{dir}} a {{speed}} | `radar.cellMoving` |
| ☐ | Newly detected — no motion yet | Nouvelle cellule — pas encore de mouvement | Celda nueva — sin movimiento aún | `radar.cellNew` |
| ☐ | Not heading toward home | Ne se dirige pas vers ici | No se dirige hacia aquí | `radar.cellNotToward` |
| ☐ | Scan {{time}} | Balayage {{time}} | Barrido {{time}} | `radar.cellScan` |
| ☐ | Enable radar rings first to use direction arrows | Activez d'abord les cercles radar pour utiliser les flèches | Active primero los círculos radar para usar las flechas | `radar.directionArrowsNeedRings` |
| ☐ | Extreme | Extrême | Extremo | `radar.extreme` |
| ☐ | Hide direction arrows | Masquer les flèches de direction | Ocultar flechas de dirección | `radar.hideDirectionArrows` |
| ☐ | Rain · last hour | Pluie · dernière heure | Lluvia · última hora | `radar.legendAccum.DAA` |
| ☐ | Rain · storm total | Pluie · total épisode | Lluvia · total tormenta | `radar.legendAccum.DTA` |
| ☐ | Rain · last 3 h | Pluie · 3 dernières h | Lluvia · últimas 3 h | `radar.legendAccum.DU3` |
| ☐ | At home: {{depth}} | À la maison : {{depth}} | En casa: {{depth}} | `radar.legendAccumAtHome` |
| ☐ | At home: none | À la maison : rien | En casa: nada | `radar.legendAccumAtHomeNone` |
| ☐ | radar max {{depth}} | max. radar {{depth}} | máx. del radar {{depth}} | `radar.legendAccumMax` |
| ☐ | MRMS · every radar in range, at the surface | MRMS · tous les radars à portée, au sol | MRMS · todos los radares al alcance, en superficie | `radar.legendAccumMosaic` |
| ☐ | MRMS mosaic loading… | Chargement de la mosaïque MRMS… | Cargando el mosaico MRMS… | `radar.legendAccumMosaicPending` |
| ☐ | Storm total is a single-radar product — zoom in to see it | Le total de l'épisode vient d'un seul radar : zoomez pour le voir | El total de la tormenta es de un solo radar: acerca el mapa para verlo | `radar.legendAccumNoMosaic` |
| ☐ | No rain in this period | Pas de pluie sur cette période | Sin lluvia en este periodo | `radar.legendAccumNone` |
| ☐ | since {{time}} | depuis {{time}} | desde las {{time}} | `radar.legendAccumSince` |
| ☐ | No accumulation published by this radar | Ce radar ne publie pas de cumul | Este radar no publica acumulación | `radar.legendAccumUnavailable` |
| ☐ | away | s'éloigne | se aleja | `radar.legendAway` |
| ☐ | Dual-pol clean | Nettoyage dual-pol | Limpieza dual-pol | `radar.legendClean` |
| ☐ | Dual-pol clean · holding last clean scan | Nettoyage dual-pol · dernier balayage propre conservé | Limpieza dual-pol · manteniendo el último barrido limpio | `radar.legendCleanHolding` |
| ☐ | Dual-pol clean · unavailable | Nettoyage dual-pol · indisponible | Limpieza dual-pol · no disponible | `radar.legendCleanUnavailable` |
| ☐ | Close | Fermer | Cerrar | `radar.legendClose` |
| ☐ | Cloud-top temperature | Température des sommets nuageux | Temperatura de topes nubosos | `radar.legendCloudTop` |
| ☐ | Correlation coefficient | Coefficient de corrélation | Coeficiente de correlación | `radar.legendCorrelation` |
| ☐ | Near 1 uniform precipitation · low inside a rotation: debris | Proche de 1 précipitations uniformes · bas dans une rotation : débris | Cerca de 1 precipitación uniforme · bajo dentro de una rotación: escombros | `radar.legendCorrelationNote` |
| ☐ | No correlation product published by this radar | Ce radar ne publie pas le produit de corrélation | Este radar no publica el producto de correlación | `radar.legendCorrelationUnavailable` |
| ☐ | Flood | Inondation | Inundación | `radar.legendFlood` |
| ☐ | Lightning | Foudre | Rayos | `radar.legendLightning` |
| ☐ | Open the legend | Ouvrir la légende | Abrir la leyenda | `radar.legendOpen` |
| ☐ | Precipitation | Précipitations | Precipitación | `radar.legendPrecip` |
| ☐ | Precipitation type | Type de précipitations | Tipo de precipitación | `radar.legendPrecipType` |
| ☐ | MRMS · at the surface | MRMS · au sol | MRMS · en superficie | `radar.legendPtypeMosaic` |
| ☐ | No type frame for this time yet | Pas encore d'image de type pour cet instant | Aún no hay fotograma de tipo para esta hora | `radar.legendPtypeNoHistory` |
| ☐ | Radar dual-pol · aloft at the 0.5° tilt | Radar double polarisation · en altitude, site 0,5° | Radar dual-pol · en altura, elevación 0,5° | `radar.legendPtypeSite` |
| ☐ | No classification published by this radar | Ce radar ne publie pas de classification | Este radar no publica clasificación | `radar.legendPtypeUnavailable` |
| ☐ | Analysis radii | Rayons d'analyse | Radios de análisis | `radar.legendRadii` |
| ☐ | T-storm | Orage | Tormenta | `radar.legendStorm` |
| ☐ | Legend | Légende | Leyenda | `radar.legendTitle` |
| ☐ | Tornado | Tornade | Tornado | `radar.legendTornado` |
| ☐ | toward | vers le radar | hacia el radar | `radar.legendToward` |
| ☐ | Velocity (m/s) | Vitesse (m/s) | Velocidad (m/s) | `radar.legendVelocity` |
| ☐ | Light | Léger | Ligero | `radar.light` |
| ☐ | {{count}} flash · 5 min | {{count}} éclair · 5 min | {{count}} destello · 5 min | `radar.lightningCount_one` |
| ☐ | {{count}} flashes · 5 min | {{count}} éclairs · 5 min | {{count}} destellos · 5 min | `radar.lightningCount_other` |
| ☐ | {{count}} alerts here | {{count}} alertes ici | {{count}} alertas aquí | `radar.nearbyHere` |
| ☐ | +{{count}} not mapped | +{{count}} non cartographiée(s) | +{{count}} no mapeada(s) | `radar.nearbyNotMapped` |
| ☐ | Nearby alerts | Alertes à proximité | Alertas cercanas | `radar.nearbyTitle` |
| ☐ | {{count}} within {{radius}} {{unit}} | {{count}} dans {{radius}} {{unit}} | {{count}} en {{radius}} {{unit}} | `radar.nearbyWithin` |
| ☐ | Graupel | Grésil | Granizo blando | `radar.ptypeGraupel` |
| ☐ | Hail | Grêle | Granizo | `radar.ptypeHail` |
| ☐ | heavy | forte | intensa | `radar.ptypeHeavy` |
| ☐ | light | faible | ligera | `radar.ptypeLight` |
| ☐ | Mix / wet snow | Mélange / neige mouillée | Mixta / nieve húmeda | `radar.ptypeMix` |
| ☐ | Rain | Pluie | Lluvia | `radar.ptypeRain` |
| ☐ | Snow | Neige | Nieve | `radar.ptypeSnow` |
| ☐ | Show direction arrows | Afficher les flèches de direction | Mostrar flechas de dirección | `radar.showDirectionArrows` |
| ☐ | {{site}} · offline | {{site}} · hors service | {{site}} · fuera de servicio | `radar.siteOffline` |
| ☐ | {{site}} · offline · no data for {{age}} | {{site}} · hors service · aucune donnée depuis {{age}} | {{site}} · fuera de servicio · sin datos desde hace {{age}} | `radar.siteOfflineFor` |
| ☐ | {{hours}} h ago | Il y a {{hours}} h | Hace {{hours}} h | `radar.timeline.agoHours` |
| ☐ | {{min}} min ago | Il y a {{min}} min | Hace {{min}} min | `radar.timeline.agoMin` |
| ☐ | Forecast · {{off}} | Prévision · {{off}} | Pronóstico · {{off}} | `radar.timeline.forecastChip` |
| ☐ | Fcst {{off}} | Prév. {{off}} | Pron. {{off}} | `radar.timeline.forecastChipShort` |
| ☐ | {{past}} past frames · {{future}} forecast | {{past}} trames passées · {{future}} prévisions | {{past}} imágenes pasadas · {{future}} de pronóstico | `radar.timeline.frameCounts` |
| ☐ | {{past}} + {{future}} frames | {{past}} + {{future}} trames | {{past}} + {{future}} imágenes | `radar.timeline.frameCountsShort` |
| ☐ | {{past}} past frames | {{past}} trames passées | {{past}} imágenes pasadas | `radar.timeline.framesPastOnly` |
| ☐ | now | maintenant | ahora | `radar.timeline.now` |
| ☐ | Now | Maintenant | Ahora | `radar.timeline.nowMarker` |
| ☐ | Pause animation | Mettre en pause l'animation | Pausar la animación | `radar.timeline.pauseAria` |
| ☐ | Play animation | Lancer l'animation | Iniciar la animación | `radar.timeline.playAria` |
| ☐ | Return to current radar frame | Revenir à l'image radar actuelle | Volver al fotograma actual del radar | `radar.timeline.returnToNowAria` |
| ☐ | Scrub through radar frames | Parcourir les images radar | Recorrer los fotogramas del radar | `radar.timeline.scrubberAria` |
| ☐ | Radar frame list is stale — the last refresh failed | Liste des trames périmée — le dernier rafraîchissement a échoué | Lista de imágenes obsoleta — la última actualización falló | `radar.timeline.sourceStale` |
| ☐ | Cycle radar animation speed | Changer la vitesse de l'animation radar | Cambiar la velocidad de la animación del radar | `radar.timeline.speedAria` |
| ☐ | Previous frame | Image précédente | Fotograma anterior | `radar.timeline.stepBackAria` |
| ☐ | Next frame | Image suivante | Fotograma siguiente | `radar.timeline.stepForwardAria` |
| ☐ | Zoom in | Zoom avant | Acercar | `radar.zoomIn` |
| ☐ | Zoom out | Zoom arrière | Alejar | `radar.zoomOut` |

## toasts (`toasts.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Rainfall · last hour | Pluie · dernière heure | Lluvia · última hora | `toasts.accumDAA` |
| ☐ | Rainfall · storm total | Pluie · total de l'épisode | Lluvia · total de la tormenta | `toasts.accumDTA` |
| ☐ | Rainfall · last 3 hours | Pluie · 3 dernières heures | Lluvia · últimas 3 horas | `toasts.accumDU3` |
| ☐ | Rainfall totals off | Cumuls de pluie masqués | Acumulación de lluvia desactivada | `toasts.accumOff` |
| ☐ | AI summary hidden | Section IA masquée | Sección IA ocultada | `toasts.aiSummaryHidden` |
| ☐ | AI summary shown | Section IA affichée | Sección IA mostrada | `toasts.aiSummaryShown` |
| ☐ | Auto mode off | Mode automatique désactivé | Modo automático desactivado | `toasts.autoModeOff` |
| ☐ | Auto mode on | Mode automatique activé | Modo automático activado | `toasts.autoModeOn` |
| ☐ | Correlation coefficient off | Coefficient de corrélation désactivé | Coeficiente de correlación desactivado | `toasts.correlationOff` |
| ☐ | Correlation coefficient on | Coefficient de corrélation activé | Coeficiente de correlación activado | `toasts.correlationOn` |
| ☐ | Dark mode on | Mode sombre activé | Modo oscuro activado | `toasts.darkModeOn` |
| ☐ | Debug panel closed | Panneau de débogage fermé | Panel de depuración cerrado | `toasts.debugClosed` |
| ☐ | Debug panel opened | Panneau de débogage ouvert | Panel de depuración abierto | `toasts.debugOpened` |
| ☐ | Enable radar rings first | Activez d'abord les cercles radar | Active primero los círculos radar | `toasts.directionArrowsNeedRings` |
| ☐ | Direction arrows off | Flèches de direction désactivées | Flechas de dirección desactivadas | `toasts.directionArrowsOff` |
| ☐ | Direction arrows on | Flèches de direction activées | Flechas de dirección activadas | `toasts.directionArrowsOn` |
| ☐ | Default location updated | Emplacement par défaut mis à jour | Ubicación por defecto actualizada | `toasts.favoriteDefaultSet` |
| ☐ | Following your location | Suivi de votre position | Siguiendo tu ubicación | `toasts.followStarted` |
| ☐ | Stopped following | Suivi arrêté | Seguimiento detenido | `toasts.followStopped` |
| ☐ | Radar legend hidden | Légende radar masquée | Leyenda radar ocultada | `toasts.legendHidden` |
| ☐ | Radar legend shown | Légende radar affichée | Leyenda radar mostrada | `toasts.legendShown` |
| ☐ | Light mode on | Mode clair activé | Modo claro activado | `toasts.lightModeOn` |
| ☐ | Lightning off | Foudre désactivée | Rayos desactivados | `toasts.lightningOff` |
| ☐ | Lightning on | Foudre activée | Rayos activados | `toasts.lightningOn` |
| ☐ | Map recentered | Carte recentrée | Mapa recentrado | `toasts.mapRecentered` |
| ☐ | Marker hidden | Marqueur masqué | Marcador ocultado | `toasts.markerHidden` |
| ☐ | Marker shown | Marqueur affiché | Marcador mostrado | `toasts.markerShown` |
| ☐ | Nearby alerts off | Alertes à proximité désactivées | Alertas cercanas desactivadas | `toasts.nearbyAlertsOff` |
| ☐ | Nearby alerts on | Alertes à proximité activées | Alertas cercanas activadas | `toasts.nearbyAlertsOn` |
| ☐ | Night-red palette off | Palette rouge désactivée | Paleta roja desactivada | `toasts.nightRedOff` |
| ☐ | Night-red palette on | Palette rouge activée | Paleta roja activada | `toasts.nightRedOn` |
| ☐ | Dual-pol clean: non-weather echoes removed | Nettoyage dual-pol : échos non météo retirés | Limpieza dual-pol: ecos no meteorológicos eliminados | `toasts.noiseFilterClean` |
| ☐ | Noise filter: below 15 dBZ hidden | Filtre de bruit : sous 15 dBZ masqué | Filtro de ruido: se oculta por debajo de 15 dBZ | `toasts.noiseFilterDbz` |
| ☐ | Noise filter off | Filtre de bruit désactivé | Filtro de ruido desactivado | `toasts.noiseFilterOff` |
| ☐ | Dual-pol clean: no classification for this scan | Nettoyage dual-pol : pas de classification pour ce balayage | Limpieza dual-pol: sin clasificación para este barrido | `toasts.noiseFilterUnavailable` |
| ☐ | Nowcast off | Prévision immédiate désactivée | Pronóstico inmediato desactivado | `toasts.nowcastOff` |
| ☐ | Nowcast on | Prévision immédiate activée | Pronóstico inmediato activado | `toasts.nowcastOn` |
| ☐ | Precipitation type off | Type de précipitations désactivé | Tipo de precipitación desactivado | `toasts.precipTypeOff` |
| ☐ | Precipitation type on | Type de précipitations activé | Tipo de precipitación activado | `toasts.precipTypeOn` |
| ☐ | Radar hidden | Radar masqué | Radar oculto | `toasts.radarOff` |
| ☐ | Radar shown | Radar affiché | Radar visible | `toasts.radarOn` |
| ☐ | Expand the radar first | Agrandissez d'abord le radar | Amplíe primero el radar | `toasts.radarOverlaysNeedMaximize` |
| ☐ | Radar rings off | Cercles radar masqués | Círculos radar ocultados | `toasts.radarRingsOff` |
| ☐ | Radar rings on | Cercles radar affichés | Círculos radar mostrados | `toasts.radarRingsOn` |
| ☐ | Radar sites off | Sites radar désactivés | Sitios de radar desactivados | `toasts.radarSitesOff` |
| ☐ | Radar sites on — tap one to pin it | Sites radar activés — touchez-en un pour le fixer | Sitios de radar activados — toca uno para fijarlo | `toasts.radarSitesOn` |
| ☐ | Refreshing… | Rafraîchissement… | Actualizando… | `toasts.refreshing` |
| ☐ | Satellite: infrared clouds | Satellite : nuages infrarouges | Satélite: nubes infrarrojas | `toasts.satelliteIr` |
| ☐ | Satellite: infrared colored by cloud-top temperature | Satellite : infrarouge coloré selon la température des sommets | Satélite: infrarrojo coloreado por temperatura de topes | `toasts.satelliteIrColor` |
| ☐ | Satellite off | Satellite désactivé | Satélite desactivado | `toasts.satelliteOff` |
| ☐ | Satellite: visible (daylight only) | Satellite : visible (jour seulement) | Satélite: visible (solo de día) | `toasts.satelliteVis` |
| ☐ | Settings closed | Paramètres fermés | Ajustes cerrados | `toasts.settingsClosed` |
| ☐ | Settings opened | Paramètres ouverts | Ajustes abiertos | `toasts.settingsOpened` |
| ☐ | Storm tracks off | Trajectoires d'orage désactivées | Trayectorias de tormenta desactivadas | `toasts.stormTracksOff` |
| ☐ | Storm tracks on | Trajectoires d'orage activées | Trayectorias de tormenta activadas | `toasts.stormTracksOn` |
| ☐ | Timeline hidden | Chronologie masquée | Cronología ocultada | `toasts.timelineHidden` |
| ☐ | Timeline shown | Chronologie affichée | Cronología mostrada | `toasts.timelineShown` |
| ☐ | Update available — ask the kiosk admin | Mise à jour disponible — avisez l'admin du kiosque | Actualización disponible — avisa al admin del kiosco | `toasts.updateRemoteNotice` |
| ☐ | Velocity mode off | Mode vitesse désactivé | Modo velocidad desactivado | `toasts.velocityOff` |
| ☐ | Velocity mode on | Mode vitesse activé | Modo velocidad activado | `toasts.velocityOn` |

## Update modal (`update.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Update available: v{{version}} | Mise à jour disponible : v{{version}} | Actualización disponible: v{{version}} | `update.available` |
| ☐ | Update available | Mise à jour disponible | Actualización disponible | `update.availableNoVersion` |
| ☐ | Copied! | Copié ! | ¡Copiado! | `update.copied` |
| ☐ | Copy | Copier | Copiar | `update.copy` |
| ☐ | This update changes installed scripts or service files that the one-click button can't refresh on its own. Run the full command above on the device — `bash deploy/install.sh` is idempotent and will refresh only what has diverged: | Cette mise à jour modifie des scripts ou fichiers de service installés que le bouton ne peut pas rafraîchir automatiquement. Exécute la commande complète ci-dessus sur l'appareil — `bash deploy/install.sh` est idempotent et ne rafraîchira que ce qui a divergé : | Esta actualización modifica scripts o archivos de servicio instalados que el botón no puede actualizar por sí solo. Ejecuta el comando completo de arriba en el dispositivo — `bash deploy/install.sh` es idempotente y solo actualizará lo que ha divergido: | `update.deployArtefactsChanged` |
| ☐ | Done! | Fait ! | ¡Hecho! | `update.done` |
| ☐ | Failed | Échec | Error | `update.failed` |
| ☐ | New | Nouveau | Nuevo | `update.feat` |
| ☐ | Fix | Correctif | Corrección | `update.fix` |
| ☐ | latest | dernier | último | `update.latest` |
| ☐ | Your installed version is too old for the one-click update (pre-v2.4.1, before /api/update started running npm install). The auto-update would land new dependencies as missing-module crashes. Run the full command above to upgrade safely via deploy/install.sh. | Ta version installée est trop ancienne pour la mise à jour en un clic (pré-v2.4.1, avant que /api/update lance npm install). L'auto-update planterait sur des modules manquants. Exécute la commande complète ci-dessus pour mettre à jour proprement via deploy/install.sh. | Tu versión instalada es demasiado antigua para la actualización con un clic (pre-v2.4.1, antes de que /api/update ejecutase npm install). La actualización automática fallaría con módulos faltantes. Ejecuta el comando completo de arriba para actualizar de forma segura vía deploy/install.sh. | `update.needsManualUpgrade` |
| ☐ | No changelog available for this update. | Aucun journal des modifications disponible. | No hay registro de cambios disponible. | `update.noChangelog` |
| ☐ | Then restart the server manually: | Redémarrez le serveur manuellement : | Reinicie el servidor manualmente: | `update.noSystemd` |
| ☐ | Faster | Optim. | Más rápido | `update.perf` |
| ☐ | Polish | Polish | Pulido | `update.polish` |
| ☐ | Release | Version | Versión | `update.release` |
| ☐ | Restarting... | Redémarrage... | Reiniciando... | `update.restarting` |
| ☐ | SKIP THIS VERSION | IGNORER CETTE VERSION | IGNORAR ESTA VERSIÓN | `update.skip` |
| ☐ | Polish | Polish | Pulido | `update.style` |
| ☐ | Update | Mettre à jour | Actualizar | `update.update` |
| ☐ | Updating... | Mise à jour... | Actualizando... | `update.updating` |
| ☐ | WHAT'S NEW | NOUVEAUTÉS | NOVEDADES | `update.whatsNew` |

## Weather codes + current conditions (`weather.*`)

| Validé | EN | FR | ES | Clé |
|--------|----|----|-----|-----|
| ☐ | Clear | Dégagé | Despejado | `weather.clear` |
| ☐ | Cloudy | Nuageux | Nublado | `weather.cloudy` |
| ☐ | Drizzle | Bruine | Llovizna | `weather.drizzle` |
| ☐ | Feels like | Ressenti | Sensación | `weather.feelsLike` |
| ☐ | Flurries | Rafales de neige | Ráfagas de nieve | `weather.flurries` |
| ☐ | Fog | Brouillard | Niebla | `weather.fog` |
| ☐ | Freezing drizzle | Bruine verglaçante | Llovizna helada | `weather.freezingDrizzle` |
| ☐ | Freezing rain | Pluie verglaçante | Lluvia helada | `weather.freezingRain` |
| ☐ | Heavy freezing rain | Pluie verglaçante forte | Lluvia helada intensa | `weather.heavyFreezingRain` |
| ☐ | Heavy ice pellets | Grésil intense | Granizo intenso | `weather.heavyIcePellets` |
| ☐ | Heavy rain | Pluie forte | Lluvia intensa | `weather.heavyRain` |
| ☐ | Heavy snow | Neige forte | Nevada intensa | `weather.heavySnow` |
| ☐ | Ice pellets | Grésil | Granizo | `weather.icePellets` |
| ☐ | Light fog | Brume légère | Neblina ligera | `weather.lightFog` |
| ☐ | Light freezing rain | Pluie verglaçante légère | Lluvia helada ligera | `weather.lightFreezingRain` |
| ☐ | Light ice pellets | Grésil léger | Granizo ligero | `weather.lightIcePellets` |
| ☐ | Light rain | Pluie légère | Lluvia ligera | `weather.lightRain` |
| ☐ | Light snow | Neige légère | Nieve ligera | `weather.lightSnow` |
| ☐ | Light wind | Vent léger | Viento suave | `weather.lightWind` |
| ☐ | Mostly clear | Majoritairement dégagé | Mayormente despejado | `weather.mostlyClear` |
| ☐ | Mostly cloudy | Majoritairement nuageux | Mayormente nublado | `weather.mostlyCloudy` |
| ☐ | Partly cloudy | Partiellement nuageux | Parcialmente nublado | `weather.partlyCloudy` |
| ☐ | Rain | Pluie | Lluvia | `weather.rain` |
| ☐ | Snow | Neige | Nieve | `weather.snow` |
| ☐ | Strong wind | Vent fort | Viento fuerte | `weather.strongWind` |
| ☐ | Thunder storm | Orage | Tormenta | `weather.thunderStorm` |
| ☐ | Wind | Vent | Viento | `weather.wind` |

---

# Inline trilingual strings (`lbl()`)

## SettingsPanel

Settings overlay — the user-facing configuration surface. Source: `client/src/components/ambient/SettingsPanel/index.js`.

> 4 further `lbl()` calls in this file build
> at least one label from a template or a variable rather than a plain string literal,
> so there is no fixed wording to tabulate. They are counted here rather than dropped
> silently — a translation pass has to read those call sites directly.

| Validé | EN | FR | ES | Ligne |
|--------|----|----|-----|-------|
| ☐ | Local | Préf. | Local | `:53` |
| ☐ | Advanced | Avancé | Avanzado | `:55` |
| ☐ | Settings sections | Sections des paramètres | Secciones de ajustes | `:162` |
| ☐ | Close settings and return to the map | Fermer les paramètres et revenir à la carte | Cerrar los ajustes y volver al mapa | `:194` |
| ☐ | Close | Fermer | Cerrar | `:200` |
| ☐ | Local preferences | Préférences locales | Preferencias locales | `:268` |
| ☐ | Stored in the browser. No restart required. | Stockées dans le navigateur. Pas de redémarrage requis. | Almacenadas en el navegador. Sin reinicio. | `:269` |
| ☐ | Language | Langue | Idioma | `:277` |
| ☐ | Clock | Horloge | Reloj | `:301` |
| ☐ | Units | Unités | Unidades | `:307` |
| ☐ | Metric | Métrique | Métrico | `:316` |
| ☐ | Imperial | Impérial | Imperial | `:317` |
| ☐ | Speed | Vent | Viento | `:338` |
| ☐ | Hail | Grêle | Granizo | `:344` |
| ☐ | Keep screen on | Garder l'écran allumé | Mantener la pantalla encendida | `:363` |
| ☐ | Stops the display sleeping while Sweep is open. For watching radar on a mount — it does keep the screen lit, so it costs battery. Off by default. | Empêche l'écran de s'éteindre pendant que Sweep est ouvert. Pour suivre le radar sur un support — l'écran reste allumé, ce qui consomme de la batterie. Désactivé par défaut. | Evita que la pantalla se apague mientras Sweep está abierto. Para seguir el radar en un soporte — la pantalla permanece encendida, lo que consume batería. Desactivado por defecto. | `:364` |
| ☐ | Hide mouse pointer | Masquer le pointeur de la souris | Ocultar puntero del ratón | `:378` |
| ☐ | Show advisory alerts | Afficher les avis | Mostrar avisos | `:397` |
| ☐ | Also surface advisory-level alerts (Flood / Heat / Wind Advisory). Off by default. | Affiche aussi les alertes de niveau « avis » (avis de crue, de chaleur, de vent). Désactivé par défaut. | Muestra también las alertas de nivel « aviso » (aviso de inundación, calor, viento). Desactivado por defecto. | `:398` |
| ☐ | Show test alerts | Afficher les alertes de test | Mostrar alertas de prueba | `:419` |
| ☐ | Reveal NWS test/exercise alerts (non-Actual status) on this device. Maintainer / R&D — hidden by default, never sent to remote viewers. | Affiche les alertes de test/exercice NWS (statut non « Actual ») sur cet appareil. Mainteneur / R&D — masquées par défaut, jamais envoyées aux clients distants. | Muestra las alertas de prueba/ejercicio de NWS (estado no « Actual ») en este dispositivo. Mantenedor / I+D — ocultas por defecto, nunca enviadas a clientes remotos. | `:420` |
| ☐ | Show alert radius ring | Afficher l'anneau du rayon d'alerte | Mostrar el anillo del radio de alerta | `:438` |
| ☐ | Draws the dashed circle at the alert radius. Turn off to keep only the alert polygons. On by default. | Trace le cercle pointillé au rayon d'alerte. Désactiver pour ne garder que les polygones d'alerte. Activé par défaut. | Dibuja el círculo punteado en el radio de alerta. Desactívalo para conservar solo los polígonos de alerta. Activado por defecto. | `:439` |
| ☐ | Trust this Pi on this device | Faire confiance à ce Pi sur cet appareil | Confiar en este Pi en este dispositivo | `:469` |
| ☐ | Installs the Pi's certificate as a trusted profile. Fixes the home-screen icon on iOS and dismisses the security warning. See the guide for per-platform steps. | Installe le certificat du Pi comme profil de confiance. Corrige l'icône d'écran d'accueil sur iOS et fait disparaître l'avertissement de sécurité. Voir le guide pour les étapes par plateforme. | Instala el certificado del Pi como perfil de confianza. Corrige el icono de la pantalla de inicio en iOS y elimina la advertencia de seguridad. Vea la guía para los pasos por plataforma. | `:475` |
| ☐ | Download cert | Télécharger le cert | Descargar cert | `:482` |
| ☐ | Read the guide | Lire le guide | Leer la guía | `:494` |
| ☐ | Basemap | Fond de carte | Mapa base | `:563` |
| ☐ | Optional. Stored on this device only. | Facultatif. Stocké sur cet appareil uniquement. | Opcional. Almacenado solo en este dispositivo. | `:564` |
| ☐ | KEYLESS | SANS CLÉ | SIN CLAVE | `:570` |
| ☐ | Mapbox token | Jeton Mapbox | Token de Mapbox | `:576` |
| ☐ | Public access token | Jeton d'accès public | Token de acceso público | `:579` |
| ☐ | In use | Actif | En uso | `:580` |
| ☐ | Remove | Retirer | Quitar | `:586` |
| ☐ | That is a SECRET token (sk.). Never put one in an app — anyone with the APK can read it. Create a public token instead. | Ceci est un jeton SECRET (sk.). N'en placez jamais dans une application — quiconque possède l'APK peut le lire. Créez plutôt un jeton public. | Ese es un token SECRETO (sk.). Nunca lo pongas en una app — cualquiera con el APK puede leerlo. Crea un token público. | `:588` |
| ☐ | A Mapbox public token starts with « pk. ». | Un jeton public Mapbox commence par « pk. ». | Un token público de Mapbox empieza por « pk. ». | `:593` |
| ☐ | Empty = Esri's keyless basemap. With a public token (pk.) the app draws Mapbox instead, and the style pickers in Advanced apply. The token needs the styles:tiles scope — that is the one the raster tile endpoint checks, and it is on by default for a new public token. A freshly created token can take a few minutes to start working. Use one separate from any the kiosk uses, so it can be revoked on its own. | Vide = fond de carte Esri sans clé. Avec un jeton public (pk.), l'application affiche Mapbox et les styles du volet Avancé s'appliquent. Le jeton doit avoir la portée styles:tiles — c'est celle que vérifie le point d'accès des tuiles raster, active par défaut sur un nouveau jeton public. Un jeton tout juste créé peut mettre quelques minutes à fonctionner. Utilisez-en un distinct de celui du kiosque, pour pouvoir le révoquer seul. | Vacío = mapa base de Esri sin clave. Con un token público (pk.) la app dibuja Mapbox y se aplican los estilos de Avanzado. El token necesita el ámbito styles:tiles — es el que comprueba el endpoint de teselas ráster, activo por defecto en un token público nuevo. Un token recién creado puede tardar unos minutos en funcionar. Usa uno distinto del que use el quiosco, para poder revocarlo por separado. | `:597` |
| ☐ | ✓ Saved | ✓ Enregistré | ✓ Guardado | `:611` |
| ☐ | Save token | Enregistrer le jeton | Guardar token | `:612` |
| ☐ | Map tiles + styles | Tuiles de carte + styles | Teselas y estilos de mapa | `:749` |
| ☐ | Reverse geocoding · place name | Géocodage inverse · nom de lieu | Geocodificación inversa · nombre del lugar | `:751` |
| ☐ | Configuration & API keys | Configuration & clés API | Configuración y claves API | `:758` |
| ☐ | Server-side settings.json. Local writes only. | settings.json côté serveur. Écriture locale uniquement. | settings.json del servidor. Escritura local únicamente. | `:759` |
| ☐ | READ-ONLY | LECTURE SEULE | SOLO LECTURA | `:766` |
| ☐ | EDITABLE | MODIFIABLE | EDITABLE | `:767` |
| ☐ | API keys | Clés API | Claves API | `:775` |
| ☐ | Location & hardware | Localisation & matériel | Ubicación y hardware | `:786` |
| ☐ | Latitude | Latitude | Latitud | `:797` |
| ☐ | Latitude | Latitude | Latitud | `:805` |
| ☐ | Override | Manuel | Manual | `:806` |
| ☐ | Auto | Auto | Auto | `:813` |
| ☐ | Empty = automatic geolocation. « Auto » clears the field to fall back to detection. Never sent to an external service. | Vide = géolocalisation automatique. « Auto » efface le champ pour revenir à la détection. Jamais transmis à un service externe. | Vacío = geolocalización automática. « Auto » borra el campo para volver a la detección. Nunca se envía a un servicio externo. | `:814` |
| ☐ | Override | Manuel | Manual | `:831` |
| ☐ | Auto | Auto | Auto | `:838` |
| ☐ | Empty = automatic geolocation. | Vide = géolocalisation automatique. | Vacío = geolocalización automática. | `:839` |
| ☐ | Radar site | Site radar | Sitio de radar | `:847` |
| ☐ | Auto (nearest) | Auto (le plus proche) | Auto (más cercano) | `:848` |
| ☐ | Radar site | Site radar | Sitio de radar | `:854` |
| ☐ | Override | Manuel | Manual | `:855` |
| ☐ | Auto | Auto | Auto | `:861` |
| ☐ | NEXRAD id, e.g. LWX or KLWX. Empty = the radar nearest the map location. | Identifiant NEXRAD, p. ex. LWX ou KLWX. Vide = le radar le plus proche de la position de la carte. | Id NEXRAD, p. ej. LWX o KLWX. Vacío = el radar más cercano a la ubicación del mapa. | `:862` |
| ☐ | Brightness | Luminosité | Brillo | `:870` |
| ☐ | Display scale | Échelle d'affichage | Escala de pantalla | `:882` |
| ☐ | Auto | Auto | Auto | `:886` |
| ☐ | Settable only from the kiosk. | Réglable seulement depuis le kiosque. | Solo ajustable desde el quiosco. | `:897` |
| ☐ | Saving… | Enregistrement… | Guardando… | `:922` |
| ☐ | ✓ Saved | ✓ Enregistré | ✓ Guardado | `:924` |
| ☐ | Save changes | Enregistrer | Guardar cambios | `:925` |
| ☐ | Advanced | Avancé | Avanzado | `:1003` |
| ☐ | Display · alerts | Affichage · alertes | Pantalla · alertas | `:1005` |
| ☐ | Display · alerts · sleep | Affichage · alertes · veille | Pantalla · alertas · suspensión | `:1006` |
| ☐ | Display | Affichage | Pantalla | `:1011` |
| ☐ | Map · light | Carte · clair | Mapa · claro | `:1022` |
| ☐ | Map · dark | Carte · sombre | Mapa · oscuro | `:1033` |
| ☐ | Radar palette | Palette radar | Paleta del radar | `:1049` |
| ☐ | Radar opacity · light | Opacité radar · clair | Opacidad radar · claro | `:1058` |
| ☐ | Radar opacity · dark | Opacité radar · sombre | Opacidad radar · oscuro | `:1068` |
| ☐ | Nearby alerts | Alertes à proximité | Alertas cercanas | `:1081` |
| ☐ | Alert radius | Rayon d'alerte | Radio de alerta | `:1087` |
| ☐ | Sleep | Veille | Suspensión | `:1110` |
| ☐ | Enable sleep | Activer la veille | Activar suspensión | `:1128` |
| ☐ | Red text at night | Texte rouge nuit | Texto rojo de noche | `:1134` |
| ☐ | Soft sleep · delay | Veille douce · délai | Suspensión suave · retraso | `:1142` |
| ☐ | Soft sleep · brightness | Veille douce · lum. | Suspensión suave · brillo | `:1151` |
| ☐ | Soft sleep · brightness | Veille douce · lum. | Suspensión suave · brillo | `:1161` |
| ☐ | Deep sleep · enabled | Veille profonde · activée | Suspensión profunda · activada | `:1172` |
| ☐ | Deep sleep · +delay | Veille profonde · +délai | Suspensión profunda · +retraso | `:1184` |
| ☐ | Diagnostic | Diagnostic | Diagnóstico | `:1195` |
| ☐ | Debug panel | Panneau Débogage | Panel depuración | `:1199` |
| ☐ | (set via DEBUG=true on the service) | (défini par DEBUG=true au service) | (definido por DEBUG=true en el servicio) | `:1202` |
| ☐ | disabled | désactivée | desactivada | `:1308` |
| ☐ | On | Allumé | Encendido | `:1318` |
| ☐ | Soft sleep | Veille douce | Suspensión suave | `:1322` |
| ☐ | Deep sleep | Veille profonde | Suspensión profunda | `:1326` |
| ☐ | Tap again — screen blacks ~15 s | Encore — écran noir ~15 s | Otra vez — pantalla negra ~15 s | `:1473` |
| ☐ | Relaunch kiosk to apply | Relancer le kiosque pour appliquer | Reiniciar el quiosco para aplicar | `:1474` |
| ☐ | Applied live · stored on this device | Appliqué en direct · stocké sur cet appareil | Aplicado en vivo · guardado en este dispositivo | `:1530` |
| ☐ | Optional · stored on this device, never in the app | Facultatif · stocké sur cet appareil, jamais dans l'application | Opcional · guardado en este dispositivo, nunca en la app | `:1537` |
| ☐ | Keys & coordinates saved together via Save | Clés et coordonnées enregistrées ensemble via Enregistrer | Claves y coordenadas guardadas juntas con Guardar | `:1541` |
| ☐ | Each setting saved on this device on change | Chaque réglage enregistré sur cet appareil au changement | Cada ajuste se guarda en este dispositivo al cambiar | `:1548` |
| ☐ | Each setting saved to settings.json on change | Chaque réglage enregistré dans settings.json au changement | Cada ajuste se guarda en settings.json al cambiar | `:1552` |
| ☐ | Remote connection detected. To change these settings, open an SSH tunnel from your local machine and reload the app from https://localhost:8443. | Connexion distante détectée. Pour modifier ces paramètres, ouvrez un tunnel SSH depuis votre poste local et rechargez l'application depuis https://localhost:8443. | Conexión remota detectada. Para modificar estos ajustes, abra un túnel SSH desde su equipo local y recargue la app desde https://localhost:8443. | `:1586` |
| ☐ | Copy command | Copier la commande | Copiar comando | `:1597` |
| ☐ | Copy command | Copier la commande | Copiar comando | `:1598` |
| ☐ | Copied! | Copié ! | ¡Copiado! | `:1601` |
| ☐ | Copy | Copier | Copiar | `:1602` |

## DebugPanel

Debug overlay — localhost-only, reached from a desktop browser or an SSH tunnel. Source: `client/src/components/ambient/DebugPanel/index.js`.

| Validé | EN | FR | ES | Ligne |
|--------|----|----|-----|-------|
| ☐ | Shown | Affiché | Visible | `:275` |
| ☐ | Update available | Mise à jour disponible | Actualización disponible | `:304` |
| ☐ | UPD | MAJ | ACT | `:306` |
| ☐ | Close | Fermer | Cerrar | `:336` |
| ☐ | Updated | Actualisé | Actualizado | `:349` |
| ☐ | ON | ACTIF | ACTIVO | `:425` |
| ☐ | OFF | INACTIF | INACTIVO | `:426` |
| ☐ | NONE | AUCUN | NINGUNO | `:433` |
| ☐ | MINOR | MINEUR | MENOR | `:434` |
| ☐ | MAJOR | MAJEUR | MAYOR | `:435` |
| ☐ | CRITICAL | CRITIQUE | CRÍTICO | `:436` |
| ☐ | MAINTENANCE | MAINTENANCE | MANTENIMIENTO | `:437` |
| ☐ | Server | Serveur | Servidor | `:522` |
| ☐ | Client | Client | Cliente | `:523` |
| ☐ | Services | Services | Servicios | `:524` |
| ☐ | About | À propos | Acerca de | `:525` |
| ☐ | Server config | Configuration serveur | Configuración servidor | `:741` |
| ☐ | version | version | versión | `:743` |
| ☐ | branch | branche | rama | `:747` |
| ☐ | Network | Réseau | Red | `:760` |
| ☐ | Server KPI | KPI serveur | KPI servidor | `:773` |
| ☐ | Power status | État alimentation | Estado de alimentación | `:790` |
| ☐ | Response times | Temps de réponse | Tiempos de respuesta | `:797` |
| ☐ | avg | moy | prom | `:803` |
| ☐ | Nowcast skill (live) | Fiabilité prévision immédiate (direct) | Acierto del pronóstico inmediato (en vivo) | `:812` |
| ☐ | Recent logs | Journaux récents | Registros recientes | `:833` |
| ☐ | Offline — check the connection | Hors ligne — vérifiez la connexion | Sin conexión — compruebe la conexión | `:877` |
| ☐ | Online · degraded network | En ligne · réseau dégradé | En línea · red degradada | `:879` |
| ☐ | Online · slow network | En ligne · réseau lent | En línea · red lenta | `:881` |
| ☐ | Online · fast network | En ligne · réseau rapide | En línea · red rápida | `:882` |
| ☐ | No logs to show. | Aucun journal à afficher. | Sin registros para mostrar. | `:969` |
| ☐ | Client KPI | KPI client | KPI cliente | `:1080` |
| ☐ | Current position | Position actuelle | Posición actual | `:1102` |
| ☐ | API calls (session) | Appels API (session) | Llamadas API (sesión) | `:1120` |
| ☐ | avg | moy | prom | `:1129` |
| ☐ | Remote clients | Clients distants | Clientes remotos | `:1135` |
| ☐ | No remote clients tracked yet. | Aucun client distant suivi. | Ningún cliente remoto rastreado. | `:1137` |
| ☐ | Security events | Événements de sécurité | Eventos de seguridad | `:1154` |
| ☐ | No security events. | Aucun événement de sécurité. | Ningún evento de seguridad. | `:1156` |
| ☐ | BLOCKED | BLOQUÉ | BLOQUEADO | `:1161` |
| ☐ | Provider statuspages | Statut fournisseurs | Estado de proveedores | `:1184` |
| ☐ | last fetch | dernière requête | última consulta | `:1186` |
| ☐ | No provider status available. | Aucun statut fournisseur disponible. | Estado del proveedor no disponible. | `:1190` |
| ☐ | Recent service calls | Appels de service récents | Llamadas de servicio recientes | `:1207` |
| ☐ | No service activity yet. | Aucune activité de service. | Sin actividad de servicio. | `:1209` |
| ☐ | API quotas | Quotas API | Cuotas API | `:1226` |
| ☐ | No quota data tracked yet. | Aucune donnée de quota suivie. | Sin datos de cuota rastreados. | `:1227` |
| ☐ | Checking… | Vérification… | Comprobando… | `:1379` |
| ☐ | Check for updates | Vérifier les mises à jour | Buscar actualizaciones | `:1380` |
| ☐ | Checking… | Vérification… | Comprobando… | `:1384` |
| ☐ | Check for updates | Vérifier les mises à jour | Buscar actualizaciones | `:1385` |
| ☐ | Export CSV | Exporter CSV | Exportar CSV | `:1391` |
| ☐ | Export CSV | Exporter CSV | Exportar CSV | `:1394` |
| ☐ | About this build | À propos de cette version | Acerca de esta versión | `:1398` |
| ☐ | name | nom | nombre | `:1400` |
| ☐ | version | version | versión | `:1401` |
| ☐ | branch | branche | rama | `:1403` |
| ☐ | license | licence | licencia | `:1405` |
| ☐ | Update check | Vérification MAJ | Comprobación actualización | `:1412` |
| ☐ | This install is too old for the in-app updater. Run | Cette installation est trop ancienne pour la mise à jour in-app. Lancez | Esta instalación es demasiado antigua para el actualizador in-app. Ejecuta | `:1424` |
| ☐ | on the device to upgrade. | sur l'appareil pour mettre à jour. | en el dispositivo para actualizar. | `:1430` |
| ☐ | Install update… | Installer la mise à jour… | Instalar actualización… | `:1450` |
| ☐ | latest ver | dernière ver | última ver | `:1459` |
| ☐ | available | disponible | disponible | `:1460` |
| ☐ | YES | OUI | SÍ | `:1461` |
| ☐ | UP-TO-DATE | À JOUR | AL DÍA | `:1462` |
| ☐ | Vulnerability scan | Analyse vulnérabilités | Análisis vulnerabilidades | `:1469` |
| ☐ | Vulnerability scanning + automatic security PRs now live on GitHub via Dependabot — see the alerts dashboard for the live source of truth. | L'analyse des vulnérabilités et les PR de sécurité automatiques vivent maintenant sur GitHub via Dependabot — voir le tableau d'alertes pour la source en temps réel. | El análisis de vulnerabilidades y los PR de seguridad automáticos viven ahora en GitHub vía Dependabot — consulta el panel de alertas para la fuente en tiempo real. | `:1472` |
| ☐ | Check security alerts on GitHub | Vérifier les alertes de sécurité sur GitHub | Ver las alertas de seguridad en GitHub | `:1493` |
| ☐ | POWER OK | ALIMENTATION OK | ALIMENTACIÓN OK | `:1560` |

---

# Universal strings (identical across EN / FR / ES)

Pure abbreviations, units, proper nouns and technical markers. Listed for completeness so
a translator can confirm they are deliberately untranslated rather than overlooked.

| Valeur | Clé |
|---|---|
| {{current}} / {{count}} | `alert.activeAlertsCountShort` |
| TEST | `alert.testTag` |
| NowCast | `badges.aqiKindNowcast` |
| EPA AirNow | `badges.aqiSourceAirNow` |
| OpenAQ | `badges.aqiSourceOpenAq` |
| 24 h | `charts.period24h` |
| prob. | `charts.pillProb` |
| Temp | `charts.tabTemp` |
| E | `compass.e` |
| N | `compass.n` |
| NE | `compass.ne` |
| S | `compass.s` |
| SE | `compass.se` |
| OK | `health.shortOk` |
| gr/m³ | `metrics.pollenUnit` |
| UV | `metrics.uv` |
| 1 h | `radar.ageAccum.DAA` |
| total | `radar.ageAccum.DTA` |
| 3 h | `radar.ageAccum.DU3` |
| CC | `radar.ageCorrelation` |
| GLM | `radar.ageLightning` |
| MRMS 1 h | `radar.ageMosaicAccum.DAA` |
| MRMS 3 h | `radar.ageMosaicAccum.DU3` |
| ≈ {{minutes}} min | `radar.stormArrival` |
| ≈ {{hours}} h {{minutes}} min | `radar.stormArrivalHours` |
| Deps | `update.deps` |
| local | `update.local` |
| UX | `update.ux` |

# Segway E125S stock power envelope

**Date:** 2026-10-24  
**Status:** provisional hardware profile; road and thermal validation still required.

This note records the reasoning behind the conservative current limits used by the E125S quick-setup UI. It is deliberately more restrictive than the controller hardware can accept.

## Known vehicle data

Segway publishes the E125S with two 48 V 30 Ah lithium packs (60 Ah total). Depending on regional material, Segway quotes a maximum motor power of 3.0 kW or 3.5 kW.

Sources:

- Segway Europe E125S specifications: 48 V, 30 Ah x2, 3.0 kW maximum motor power  
  https://eu-en.segway.com/escooter/products/e125s.html
- Segway Australia E125S specifications: 48 V, 30 Ah x2, 3.5 kW maximum motor power  
  https://au.segway.com/escooter/products/e110s-and-e125s.html

A European Segway parts reseller lists the original 45 km/h E125S motor controller as an 85 A unit. This is useful corroboration that an 80 A class current path exists in the stock vehicle, but it is not a Segway engineering datasheet and does not by itself prove an 85 A continuous battery-discharge rating.

- Original E125S 45 km/h controller, listed as 85 A  
  https://sb-electronics.de/en/segway-e125s-controller-85-a-45-km-h-original/SEBA00000557E125S

The supplied EScootParts programming guide for the replacement motherboard states 90 A maximum line current for the dual-battery E125 (45 A per battery). Keep that as a supplier ceiling, not as the default tune. The current EScootParts product pages also make clear that larger controller ratings are controller capability and that motor, battery, BMS and wiring must be matched to the requested current.

- EScootParts Segway programmable controller page  
  https://escootparts.com/product/segway-motherboard-3-modes-bluetooth-programmable/
- EScootParts heavy-performance controller page  
  https://escootparts.com/product/segway-scooter-heavy-performance-bluetooth-motherboard/

FarDriver's own tuning documentation defines **maximum line current** as battery-bus current and **maximum phase current** as motor winding current. They are different limits and should not be treated interchangeably.

- FarDriver controller parameter adjustment guide  
  https://www.far-driver.com/wp-content/uploads/The-adjustment-instructions-of-the-control-parameters-of-the-Fardriver-controller-.pdf

## Current UI policy

For the stock E125S dual-battery profile:

| Setting | UI value | Rationale |
| --- | ---: | --- |
| Baseline line current | 60 A | Existing conservative working tune |
| Recommended maximum | **70 A** | About 3.36 kW electrical input at nominal 48 V; close to the vehicle's published peak-power region without using the supplier ceiling |
| Sport ceiling | **80 A** | About 3.84 kW at nominal 48 V; below the 85 A stock-controller rating and below the supplier's 90 A dual-pack ceiling, but above the recommended stock tune |
| Supplier ceiling | 90 A | Recorded for reference only; intentionally not exposed in quick setup |
| Baseline phase current | 180 A | Existing controller/motor tune; keep separate from battery line current |

The 70 A and 80 A values are **engineering guardrails, not certified continuous ratings**. Battery condition, cell temperature, BMS firmware, wiring, connectors, ambient temperature, motor temperature and sustained speed all matter.

## Why 70 A is the default ceiling

At nominal 48 V:

- 60 A = 2.88 kW electrical input
- 70 A = 3.36 kW
- 80 A = 3.84 kW
- 85 A = 4.08 kW
- 90 A = 4.32 kW

Electrical input is not the same as mechanical motor output. Losses reduce shaft power, but sustained high current still creates additional heat in the battery, wiring, controller and motor.

The stock motor is published around a 3.0-3.5 kW peak depending on region. That makes **70 A the sensible stock quick-setup ceiling** until real temperature and BMS-current data are logged. **80 A is retained as a user-selectable sport ceiling** for short bursts, with an explicit warning in the UI.

## Validation required before raising the defaults

1. Log both battery-pack currents if the Segway BMS exposes them.
2. Confirm current sharing between the two packs under full throttle.
3. Record battery, controller and motor temperature on repeated acceleration runs.
4. Confirm no BMS over-current or undervoltage trips at 70 A.
5. Repeat at 80 A only after 70 A is clean.
6. Inspect the high-current connectors and wiring for heating after the test.
7. Do not move the quick-setup ceiling to 90 A unless the battery/BMS and thermal evidence supports it.

## UI implications

The guided setup intentionally exposes:

- **Range:** 55 A line current, softer acceleration.
- **Daily:** 60 A line current.
- **Sport:** 70 A line current, maximum acceleration ramp.
- Manual power slider: 40-80 A.
- Values above 70 A show a warning.
- 90 A is not available from quick setup.
- Road-speed target remains preview-only until the E125S pole-pair and speed calibration are hardware-validated.

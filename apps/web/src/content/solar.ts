import { builder } from '@/features/workbench/examples';
import type { Check, Module } from '@/features/learn/types';

const between = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
const dcVolts = (c: Check, lo: number, hi: number) => { const m = c.dmm(); return !!m && m.mode === 'V DC' && between(Math.abs(m.value), lo, hi); };
const dcAmps = (c: Check, lo: number, hi: number) => { const m = c.dmm(); return !!m && m.mode === 'A DC' && between(Math.abs(m.value), lo, hi); };
const cc = (c: Check, key: string) => c.read('charge-controller', key);

export const solar: Module = {
  id: 'solar', title: 'Solar: an off-grid 12 V system', level: 'School & college',
  blurb: 'A 55 W panel, a 10 A PWM charge controller and a 12 V 26 Ah battery running a fan, a phone and a WiFi router — wired, measured and broken safely.',
  lessons: [
    {
      id: 'full-setup', title: 'Wire the whole system in the safe order', minutes: 15,
      summary: 'Panel → charge controller → battery → load. The order you connect things matters: the controller must see the battery first.',
      goals: ['Connect battery, fuse, controller, panel and load', 'See why the battery goes first', 'Watch the battery charge'],
      build() {
        const { doc, part } = builder();
        part('solar', 0, 0, { sun: 90 }); part('charge-controller', 24, 14);
        part('battery', 20, 26, { volts: '12' }); part('fuse', 12, 26, { rating: '10' }); part('dc-fan', 40, 14);
        return doc;
      },
      steps: [
        { title: 'Try the mistake first', text: 'Wire ONLY the panel to the controller: panel + → PV+, panel − → PV−. With no battery, the controller wakes up on the panel’s ~24 V and decides it is a 24 V system.', check: c => cc(c, 'mode') === '24V', hint: 'Drag from the panel’s MC4 + to the controller’s PV+ terminal, and − to PV−.', demo: [{ wire: ['solar#0:+', 'charge-controller#0:PV+'] }, { wire: ['solar#0:-', 'charge-controller#0:PV-'], color: '#1d1d1b' }] },
        { title: 'Fix it: battery first, through the fuse', text: 'Unplug both panel wires (select a wire, press Delete). Now wire battery + → fuse → controller BAT+, and battery − → BAT−. The LCD should show a 12 V system.', check: c => cc(c, 'mode') === '12V' && !c.joined(c.pin('solar', '+'), c.pin('charge-controller', 'PV+')), hint: 'The 10 A fuse goes in the + wire, close to the battery.', demo: [{ unwire: ['solar#0:+', 'charge-controller#0:PV+'] }, { unwire: ['solar#0:-', 'charge-controller#0:PV-'] }, { wire: ['battery#0:+', 'fuse#0:1'] }, { wire: ['fuse#0:2', 'charge-controller#0:BAT+'] }, { wire: ['battery#0:-', 'charge-controller#0:BAT-'], color: '#1d1d1b' }] },
        { title: 'Panel second', text: 'Now connect the panel to PV+ and PV−. In the sun the controller starts charging the battery.', check: c => cc(c, 'charging') === true, demo: [{ wire: ['solar#0:+', 'charge-controller#0:PV+'] }, { wire: ['solar#0:-', 'charge-controller#0:PV-'], color: '#1d1d1b' }] },
        { title: 'Load last', text: 'Connect the 12 V fan to LOAD+ and LOAD−. Loads always go on the LOAD terminals, never straight on the battery.', check: c => Number(c.read('dc-fan', 'volts')) > 11, demo: [{ wire: ['charge-controller#0:LOAD+', 'dc-fan#0:+'] }, { wire: ['charge-controller#0:LOAD-', 'dc-fan#0:-'], color: '#1d1d1b' }] },
      ],
      tryIt: [['Take the battery off while the panel is still connected', 'the controller has nothing to regulate against. Disconnect in reverse: load → panel → battery last.'], ['Swap red and black on the battery', 'the controller’s protection diode conducts and the fuse blows.']],
      quiz: [
        { q: 'What do you connect to the controller first?', options: ['The panel', 'The battery', 'The load'], answer: 1, why: 'The controller detects 12 V or 24 V from the battery when it powers up.' },
        { q: 'Where does the 10 A fuse go?', options: ['On the panel −', 'On battery +, close to the battery', 'On the fan'], answer: 1, why: 'It protects the battery wire: a battery can push hundreds of amps into a short.' },
        { q: 'Disconnecting order?', options: ['Battery first', 'Load → panel → battery', 'Any order'], answer: 1, why: 'Reverse of connecting: the battery is removed last.' },
      ],
    },
    {
      id: 'panel', title: 'The solar panel: Voc and Isc', minutes: 12,
      summary: 'A 55 W panel gives about 24.5 V with nothing connected (Voc) and about 2.8 A when shorted (Isc). Both depend on the sun.',
      goals: ['Measure open-circuit voltage', 'Measure short-circuit current safely', 'See how sunlight changes current'],
      build() {
        const { doc, part } = builder();
        part('solar', 0, 0, { sun: 90 }); part('dmm', 22, -4, { knob: 'V', ac: false });
        return doc;
      },
      steps: [
        { title: 'Measure Voc', text: 'Meter on V DC. Red VΩmA lead to panel +, black COM lead to panel −. Expect 22–24.5 V in good sun.', check: c => dcVolts(c, 21, 25.5), demo: [{ set: 'dmm#0', props: { knob: 'V', ac: false }, say: 'Meter on V, then FUNC → DC' }, { wire: ['dmm#0:VmA', 'solar#0:+'] }, { wire: ['dmm#0:COM', 'solar#0:-'], color: '#1d1d1b' }] },
        { title: 'Measure Isc', text: 'A panel can only push about 2.8 A, so measuring its short-circuit current through the 10A jack is safe (never do this on a battery!). Turn the knob to A, move the red lead from VΩmA to the 10A jack.', check: c => dcAmps(c, 2.2, 2.95), hint: 'Delete the red wire on VΩmA and draw a new one from 10A to panel +.', demo: [{ unwire: ['dmm#0:VmA', 'solar#0:+'] }, { set: 'dmm#0', props: { knob: 'A', ac: false }, say: 'Turn the knob to A' }, { wire: ['dmm#0:10A', 'solar#0:+'] }] },
        { title: 'A cloud passes', text: 'Set the panel’s sunlight to 50 %. Watch the current fall roughly in half — current follows the light.', check: c => Number(c.prop('solar', 'sun')) <= 60 && dcAmps(c, 1.0, 1.8), demo: [{ set: 'solar#0', props: { sun: 50 }, say: 'Tap the panel → Sunlight: 50 %' }] },
      ],
      tryIt: [['Set sunlight to 5 %', 'the voltage barely drops but the current almost vanishes: voltage needs only a little light, current needs a lot.']],
      quiz: [
        { q: 'Voc means…', options: ['voltage with nothing connected', 'voltage while charging', 'voltage at night'], answer: 0, why: 'Open-circuit: no current flowing.' },
        { q: 'Why is shorting a panel through the 10A jack OK but a battery is not?', options: ['A panel’s current is limited to ~2.8 A', 'Panels are AC', 'It isn’t OK either'], answer: 0, why: 'A battery can deliver hundreds of amps into a short.' },
        { q: 'With half the sunlight, the current is about…', options: ['the same', 'half', 'double'], answer: 1, why: 'Current is proportional to light.' },
      ],
    },
    {
      id: 'controller', title: 'The charge controller and the low-voltage cut (LVD)', minutes: 15,
      summary: 'The controller protects the battery. With LVD on it cuts the load at a set voltage (12.0 V ≈ 40 %). With LVD off the battery may run right down until it is flat (~10.8 V).',
      goals: ['Switch LVD on and off', 'See the load cut and reconnect', 'See a flat battery'],
      build() {
        const { doc, part, wire } = builder();
        const psu = part('psu', 0, 0, { volts: 12.6, limit: 3 }), ctl = part('charge-controller', 18, 6), fan = part('dc-fan', 34, 6);
        wire(psu('+'), ctl('BAT+')); wire(psu('-'), ctl('BAT-'), 'black');
        wire(ctl('LOAD+'), fan('+')); wire(ctl('LOAD-'), fan('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'A bench supply plays the battery', text: 'So you can change the battery voltage instantly, the controller’s BAT terminals are on a bench power supply. LVD is OFF by default here. Turn it ON: select the controller and untick “LVD off” (LVD stays at 12.0 V).', check: c => c.prop('charge-controller', 'lvdOff') === false, demo: [{ set: 'charge-controller#0', props: { lvdOff: false }, say: 'Tap the controller → untick LVD off' }] },
        { title: 'Run the battery down', text: 'Turn the supply down to 11.8 V. The controller sees a low battery and cuts the fan.', check: c => Number(c.prop('psu', 'volts')) <= 11.9 && cc(c, 'lvdCut') === true, demo: [{ set: 'psu#0', props: { volts: 11.8 }, say: 'Tap the supply → 11.8 V' }] },
        { title: 'Recharge', text: 'Turn the supply back up to 12.7 V. The load comes back once the battery reaches 12.6 V.', check: c => Number(c.prop('psu', 'volts')) >= 12.6 && cc(c, 'lvdCut') === false && cc(c, 'load') === true, demo: [{ set: 'psu#0', props: { volts: 12.7 }, say: 'Tap the supply → 12.7 V' }] },
        { title: 'LVD off: drain it fully', text: 'Tick “LVD off” again and turn the supply down to 11.0 V. The fan keeps running — nothing protects the battery now.', check: c => c.prop('charge-controller', 'lvdOff') === true && Number(c.prop('psu', 'volts')) <= 11.2 && cc(c, 'load') === true, demo: [{ set: 'charge-controller#0', props: { lvdOff: true }, say: 'Tap the controller → tick LVD off' }, { set: 'psu#0', props: { volts: 11 }, say: 'Tap the supply → 11.0 V' }] },
        { title: 'Flat battery', text: 'Go down to 10.6 V. Even with LVD off, the controller stops everything when the battery is flat and waits for the sun.', check: c => cc(c, 'flat') === true, demo: [{ set: 'psu#0', props: { volts: 10.6 }, say: 'Tap the supply → 10.6 V' }] },
      ],
      tryIt: [['Set LVD to 10.5 V', 'the battery is drained far too deep every night; a lead-acid battery loses capacity quickly this way.']],
      quiz: [
        { q: 'LVD stands for…', options: ['Low-Voltage Disconnect', 'Load Voltage Display', 'Light Variable Diode'], answer: 0, why: 'It disconnects the load when the battery voltage is low.' },
        { q: 'After an LVD cut at 12.0 V, the load comes back at…', options: ['12.0 V', '12.6 V', '14.4 V'], answer: 1, why: 'The gap stops the load switching on and off again and again.' },
        { q: 'Why might you turn LVD off?', options: ['To get every last Ah out of the battery', 'To charge faster', 'It is always better'], answer: 0, why: 'You get more runtime, but deep discharges shorten a lead-acid battery’s life.' },
      ],
    },
    {
      id: 'state-of-charge', title: 'Battery voltage tells its charge', minutes: 10,
      summary: 'A resting 12 V lead-acid battery: 12.7 V ≈ 100 %, 12.4 V ≈ 75 %, 12.2 V ≈ 50 %, 11.9 V ≈ 25 %. Measure after it has rested about an hour with no load.',
      goals: ['Read voltage with the meter', 'Turn volts into percent', 'Know the 50 % line'],
      build() {
        const { doc, part } = builder();
        part('psu', 0, 0, { volts: 12.7, limit: 1 }); part('dmm', 18, -6, { knob: 'V', ac: true });
        return doc;
      },
      steps: [
        { title: 'Meter on DC', text: 'The supply stands in for a rested battery. Switch the meter to DC volts (FUNC).', check: c => c.dmm()?.mode === 'V DC', demo: [{ set: 'dmm#0', props: { ac: false }, say: 'Tap FUNC on the meter → DC' }] },
        { title: 'A full battery', text: 'Measure the “battery”: red VΩmA to +, black COM to −. 12.7 V means about 100 %.', check: c => dcVolts(c, 12.6, 12.8), demo: [{ wire: ['dmm#0:VmA', 'psu#0:+'] }, { wire: ['dmm#0:COM', 'psu#0:-'], color: '#1d1d1b' }] },
        { title: 'Half empty', text: 'Turn the supply down to 12.2 V and read it again. That is about 50 % — don’t go lower if you want the battery to last.', check: c => Number(c.prop('psu', 'volts')) <= 12.25 && dcVolts(c, 12.1, 12.3), demo: [{ set: 'psu#0', props: { volts: 12.2 }, say: 'Tap the supply → 12.2 V' }] },
        { title: 'A quarter left', text: 'Now 11.9 V: only about 25 %.', check: c => Number(c.prop('psu', 'volts')) <= 11.95 && dcVolts(c, 11.8, 12.0), demo: [{ set: 'psu#0', props: { volts: 11.9 }, say: 'Tap the supply → 11.9 V' }] },
      ],
      tryIt: [['Measure a battery while the fan is running', 'it reads lower than its real charge. Always measure at rest.']],
      quiz: [
        { q: '12.4 V at rest is about…', options: ['100 %', '75 %', '25 %'], answer: 1, why: '12.7 / 12.4 / 12.2 / 11.9 V ≈ 100 / 75 / 50 / 25 %.' },
        { q: 'Why measure at rest?', options: ['A load pulls the voltage down', 'The meter needs to warm up', 'It doesn’t matter'], answer: 0, why: 'Under load the battery voltage sags, so it looks emptier than it is.' },
      ],
    },
    {
      id: 'meter-safety', title: 'The multimeter on a solar system — and the 10A trap', minutes: 10,
      summary: 'Voltage is measured with the red lead in VΩmA. The 10A jack is a near-short: across a battery it causes a huge spark and blows the meter’s fuse.',
      goals: ['Measure battery voltage', 'See what the 10A jack does across a battery', 'Recover safely'],
      build() {
        const { doc, part } = builder();
        part('battery', 0, 0, { volts: '12' }); part('dmm', 10, -4, { knob: 'V', ac: false });
        return doc;
      },
      steps: [
        { title: 'Measure the battery', text: 'Red lead in VΩmA to battery +, black COM to −. A new battery reads 12.6 V or more.', check: c => dcVolts(c, 12.5, 12.8), demo: [{ wire: ['dmm#0:VmA', 'battery#0:+'] }, { wire: ['dmm#0:COM', 'battery#0:-'], color: '#1d1d1b' }] },
        { title: 'Make the classic mistake (on purpose)', text: 'Move the red lead from VΩmA to the 10A jack, still on battery +. The 10A jack is almost 0 Ω — the battery shorts through the meter.', check: c => c.read('dmm', 'fuseBlown') === true, hint: 'Delete the VΩmA wire and draw one from 10A to battery +.', demo: [{ unwire: ['dmm#0:VmA', 'battery#0:+'] }, { wire: ['dmm#0:10A', 'battery#0:+'] }] },
        { title: 'Recover', text: 'Take the lead out of 10A, put it back in VΩmA, replace the meter fuse (click “replace fuse” on the meter) and measure the battery again.', check: c => c.read('dmm', 'fuseBlown') === false && dcVolts(c, 12.5, 12.8), demo: [{ unwire: ['dmm#0:10A', 'battery#0:+'] }, { set: 'dmm#0', props: { fuseFix: 1 }, say: 'Tap the meter → replace fuse' }, { wire: ['dmm#0:VmA', 'battery#0:+'] }] },
      ],
      quiz: [
        { q: 'Which jack for measuring battery voltage?', options: ['10A', 'VΩmA', 'Either'], answer: 1, why: '10A is only for current, with the meter in series.' },
        { q: 'Red lead in 10A across a battery causes…', options: ['a correct reading', 'a short circuit', 'nothing'], answer: 1, why: 'The 10A jack is a tiny resistance: hundreds of amps flow.' },
      ],
    },
    {
      id: 'fuse', title: 'Wires, fuses and a short circuit', minutes: 12,
      summary: 'A fuse is the weakest link on purpose: in a short circuit it melts before the wire overheats. Pick it just above the normal current.',
      goals: ['Run a load through a fuse', 'Cause a short and watch the fuse', 'Choose a sensible rating'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '12' }), f = part('fuse', 10, -4, { rating: '10' }), fan = part('dc-fan', 20, 2);
        wire(bat('+'), f('1')); wire(f('2'), fan('+')); wire(fan('-'), bat('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'Normal running', text: 'The fan draws about 0.85 A through the 10 A fuse. Select the fuse to see its current, then press Done.' },
        { title: 'Short circuit!', text: 'Draw a wire from the fuse’s output (end 2) straight to battery −. Hundreds of amps try to flow — the fuse blows and saves the wire.', check: c => c.read('fuse', 'blown') === true, demo: [{ wire: ['fuse#0:2', 'battery#0:-'], color: '#1d1d1b' }] },
        { title: 'Fix it and size it', text: 'Delete the short wire. A 10 A fuse is the doc’s choice for the battery line (charging ~3 A plus loads). For the fan alone, set the fuse to 2 A: it still runs.', check: c => String(c.prop('fuse', 'rating')) === '2' && c.read('fuse', 'blown') === false && Number(c.read('dc-fan', 'volts')) > 11, demo: [{ unwire: ['fuse#0:2', 'battery#0:-'] }, { set: 'fuse#0', props: { rating: '2' }, say: 'Tap the fuse → Rating: 2 A' }] },
      ],
      tryIt: [['Set the fuse to 1 A with three fans in parallel', 'normal current exceeds the rating and the fuse blows without any fault.']],
      quiz: [
        { q: 'A fuse should be rated…', options: ['far above the wire’s limit', 'a little above the normal current', 'below the normal current'], answer: 1, why: 'It must not blow in normal use, but must blow before the wire overheats.' },
        { q: 'The battery fuse goes…', options: ['near the battery +', 'near the load', 'on the panel'], answer: 0, why: 'Then the whole wire run is protected.' },
        { q: 'Panel → controller with 4 sq mm wire, controller → battery with…', options: ['2.5 sq mm copper', 'thin bell wire', 'aluminium'], answer: 0, why: 'The doc uses 2.5 sq mm multi-strand copper for ~3 A charge plus loads.' },
      ],
    },
    {
      id: 'router', title: 'Run a WiFi router from the battery with a DC-DC', minutes: 15,
      summary: 'The battery swings between 11 and 14.4 V; a router wants a steady 12 V. A buck-boost DC-DC converter fixes that — and its IN− must go on the controller’s LOAD−.',
      goals: ['Wire a DC-DC from LOAD', 'Power the router', 'See why LOAD− matters'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '12' }), ctl = part('charge-controller', 12, 6);
        part('dcdc-module', 28, 2); part('router', 42, 4);
        wire(bat('+'), ctl('BAT+')); wire(bat('-'), ctl('BAT-'), 'black');
        return doc;
      },
      steps: [
        { title: 'Feed the converter from LOAD', text: 'Wire controller LOAD+ → DC-DC IN+ and LOAD− → DC-DC IN−.', check: c => c.joined(c.pin('charge-controller', 'LOAD+'), c.pin('dcdc-module', 'IN+')) && c.joined(c.pin('charge-controller', 'LOAD-'), c.pin('dcdc-module', 'IN-')) && Number(c.read('dcdc-module', 'vout')) > 11.5, demo: [{ wire: ['charge-controller#0:LOAD+', 'dcdc-module#0:IN+'] }, { wire: ['charge-controller#0:LOAD-', 'dcdc-module#0:IN-'], color: '#1d1d1b' }] },
        { title: 'Plug in the router', text: 'DC-DC OUT+ → barrel centre (C), OUT− → sleeve (S). Centre positive, like the ⊖–◉–⊕ symbol on the adapter.', check: c => c.read('router', 'ok') === true, demo: [{ wire: ['dcdc-module#0:OUT+', 'router#0:C'] }, { wire: ['dcdc-module#0:OUT-', 'router#0:S'], color: '#1d1d1b' }] },
        { title: 'Let the controller switch it', text: 'Turn the controller’s LOAD output off (select it, untick LOAD). Because IN− is on LOAD−, the router turns off too — the controller (and its LVD) is in charge.', check: c => c.prop('charge-controller', 'load') === false && c.read('router', 'ok') === false, demo: [{ set: 'charge-controller#0', props: { load: false }, say: 'Tap the controller → untick LOAD' }] },
      ],
      tryIt: [['Move DC-DC IN− to battery − instead of LOAD−', 'the router keeps running when LOAD is off — the LVD can no longer protect the battery.'], ['Turn the DC-DC trim pot to 16 V', 'more than 1.3× its rating kills the router.']],
      quiz: [
        { q: 'Why a buck-boost and not a plain buck?', options: ['The battery can be below or above 12 V', 'It is cheaper', 'Routers need AC'], answer: 0, why: '11–14.4 V in, always 12 V out: it must step down and up.' },
        { q: 'DC-DC IN− goes to…', options: ['battery −', 'controller LOAD−', 'panel −'], answer: 1, why: 'The controller switches the negative side of LOAD; that is how LVD cuts the router.' },
        { q: 'A router barrel marked ⊖–◉–⊕ is…', options: ['centre positive', 'centre negative', 'AC'], answer: 0, why: 'The dot in the middle connects to the + symbol.' },
      ],
    },
    {
      id: 'monitor', title: 'Monitor the current with a shunt resistor', minutes: 12,
      summary: 'To measure current without breaking the circuit, put a small known resistor (a shunt) in the − wire and measure the tiny voltage across it: I = V ÷ R. An INA226 board does exactly this with its 0.1 Ω R100 resistor and sends the result to an ESP32 over I2C.',
      goals: ['Measure the voltage across a shunt', 'Turn millivolts into amps', 'See why shunts must be tiny'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '12' }), fuse = part('fuse', 8, 6, { rating: '10' }), shunt = part('resistor', 8, 12, { ohms: 0.1 });
        const fan = part('dc-fan', 18, 4); part('dc-fan', 26, 4); part('dmm', 36, -8, { knob: 'V', ac: false });
        wire(bat('+'), fuse('1')); wire(fuse('2'), fan('+'));
        wire(bat('-'), shunt('1'), 'black'); wire(shunt('2'), fan('-'), 'black');
        return doc;
      },
      steps: [
        { title: 'Find the shunt', text: 'The fan’s − wire goes back to the battery through a 0.1 Ω resistor. That is the shunt: every amp of fan current makes 0.1 V across it.', hint: 'Select the resistor to see its value.' },
        { title: 'Measure across it', text: 'Meter on V DC. Red lead to the shunt end nearer the fan, black (COM) to the end nearer the battery. You should read about 0.08 V — that is 80 mV.', check: c => c.joined(c.pin('dmm', 'VmA'), c.pin('resistor', '2')) && c.joined(c.pin('dmm', 'COM'), c.pin('resistor', '1')) && dcVolts(c, 0.06, 0.11), hint: 'If it reads negative, swap the two leads.', demo: [{ set: 'dmm#0', props: { knob: 'V', ac: false }, say: 'Meter on V DC' }, { wire: ['dmm#0:VmA', 'resistor#0:2'] }, { wire: ['dmm#0:COM', 'resistor#0:1'], color: '#1d1d1b' }] },
        { title: 'Add a second fan', text: 'Wire the second fan in parallel with the first (+ to +, − to −). Twice the current flows through the shunt, so its voltage doubles: about 0.17 V = 1.7 A.', check: c => c.joined(c.pin('dc-fan', '+', 1), c.pin('dc-fan', '+', 0)) && c.joined(c.pin('dc-fan', '-', 1), c.pin('dc-fan', '-', 0)) && dcVolts(c, 0.14, 0.21), demo: [{ wire: ['dc-fan#1:+', 'dc-fan#0:+'] }, { wire: ['dc-fan#1:-', 'dc-fan#0:-'], color: '#1d1d1b' }] },
      ],
      tryIt: [['Change the shunt to 10 Ω', 'the fan barely turns: a big “shunt” steals the voltage the load needs. Shunts are tiny so they cost almost nothing.'], ['Look at the shunt with two fans', '1.7 A × 1.7 A × 0.1 Ω ≈ 0.29 W — more than a ¼ W resistor likes. Real INA226 boards are rated for about 3 A for this reason.']],
      quiz: [
        { q: 'The shunt reads 0.12 V and it is 0.1 Ω. The current is…', options: ['0.012 A', '1.2 A', '12 A'], answer: 1, why: 'I = V ÷ R = 0.12 ÷ 0.1 = 1.2 A.' },
        { q: 'Why is a shunt so small?', options: ['So it barely affects the circuit', 'To make the meter beep', 'To save copper'], answer: 0, why: 'Any voltage it drops is taken away from the load.' },
        { q: 'How does an ESP32 get the reading from an INA226?', options: ['I2C (SDA and SCL wires)', 'Through the USB cable', 'It measures the shunt with analogRead'], answer: 0, why: 'The INA226 measures the shunt itself and reports amps and volts over I2C.' },
      ],
    },
    {
      id: 'second-panel', title: 'A second panel: parallel or series?', minutes: 15,
      summary: 'A PWM controller connects the panel straight to the battery, so the panel works at battery voltage. Two panels in parallel give twice the current; in series they give twice the voltage, which a PWM controller just throws away.',
      goals: ['Add a panel in parallel', 'See shade on one panel', 'Compare with series wiring'],
      build() {
        const { doc, part, wire } = builder();
        const a = part('solar', 0, 0, { sun: 90 }); part('solar', 17, 0, { sun: 90 });
        const ctl = part('charge-controller', 36, 16), bat = part('battery', 34, 28, { volts: '12' }), fuse = part('fuse', 26, 28, { rating: '10' });
        wire(bat('+'), fuse('1')); wire(fuse('2'), ctl('BAT+')); wire(bat('-'), ctl('BAT-'), 'black');
        wire(a('+'), ctl('PV+')); wire(a('-'), ctl('PV-'), 'black');
        return doc;
      },
      steps: [
        { title: 'One panel', text: 'Panel A is wired to the controller and charging. Select the controller: ichg is about 2.5 A — almost all of the panel’s 2.83 A.' },
        { title: 'Add panel B in parallel', text: 'Wire panel B + to PV+ and B − to PV−, next to panel A. The charging current doubles to about 5 A.', check: c => c.joined(c.pin('solar', '+', 1), c.pin('charge-controller', 'PV+')) && c.joined(c.pin('solar', '-', 1), c.pin('charge-controller', 'PV-')) && between(Number(cc(c, 'ichg')), 4.5, 6), demo: [{ wire: ['solar#1:+', 'charge-controller#0:PV+'] }, { wire: ['solar#1:-', 'charge-controller#0:PV-'], color: '#1d1d1b' }] },
        { title: 'Shade panel B', text: 'A tree shades panel B: set its sunlight to 20 %. In parallel each panel adds its own current, so you only lose B’s share — about 3 A is left.', check: c => Number(c.prop('solar', 'sun', 1)) <= 30 && between(Number(cc(c, 'ichg')), 2.5, 4.2), demo: [{ set: 'solar#1', props: { sun: 20 }, say: 'Tap panel B → Sunlight: 20 %' }] },
        { title: 'Now try series', text: 'Put B back to 90 %. Rewire in series: A + → PV+, A − → B +, B − → PV−. The panels now make about 49 V, yet the charging current falls back to one panel’s ~2.5 A: a PWM controller pulls the panels down to battery voltage, so the extra volts are wasted.', check: c => Number(c.prop('solar', 'sun', 1)) >= 80 && c.joined(c.pin('solar', '-', 0), c.pin('solar', '+', 1)) && !c.joined(c.pin('solar', '-', 0), c.pin('charge-controller', 'PV-')) && !c.joined(c.pin('solar', '+', 1), c.pin('charge-controller', 'PV+')) && c.joined(c.pin('solar', '-', 1), c.pin('charge-controller', 'PV-')) && c.joined(c.pin('solar', '+', 0), c.pin('charge-controller', 'PV+')) && between(Number(cc(c, 'ichg')), 2, 3.1), hint: 'Delete A’s − wire to PV− and B’s + wire to PV+ first.', demo: [{ set: 'solar#1', props: { sun: 90 }, say: 'Panel B back to 90 %' }, { unwire: ['solar#0:-', 'charge-controller#0:PV-'] }, { unwire: ['solar#1:+', 'charge-controller#0:PV+'] }, { wire: ['solar#0:-', 'solar#1:+'] }] },
      ],
      tryIt: [['Add a third panel in series', 'about 73 V — over the controller’s 50 V limit. Series strings need an MPPT controller rated for the voltage.'], ['Imagine four panels in parallel', 'about 11 A — more than this 10 A controller can take. Three is the most it can handle.']],
      quiz: [
        { q: 'With a PWM controller, two panels in series charge with…', options: ['twice the current', 'about the same current as one panel', 'no current'], answer: 1, why: 'PWM ties the panels to the battery voltage; series only adds volts, which are wasted.' },
        { q: 'How many 2.83 A panels can go in parallel on a 10 A controller?', options: ['2', '3', '5'], answer: 1, why: '3 × 2.83 = 8.5 A; four would be 11.3 A.' },
        { q: 'One panel is shaded. Which wiring loses less?', options: ['Parallel', 'Series', 'No difference'], answer: 0, why: 'In parallel the good panel keeps giving its full current.' },
      ],
    },
    {
      id: 'inverter', title: 'An inverter for 230 V loads — and how long it lasts', minutes: 12,
      summary: 'A 300 W inverter turns 12 V DC into 230 V AC. It draws a lot of current, wastes 4–7 W when idle and must be fed straight from the battery through a big fuse.',
      goals: ['Run an AC load', 'Estimate battery current and runtime', 'See an overload trip'],
      build() {
        const { doc, part, wire } = builder();
        const bat = part('battery', 0, 0, { volts: '12' }), f = part('fuse', 10, -4, { rating: '20' }), inv = part('inverter', 20, 4, { on: true, watts: 0 });
        wire(bat('+'), f('1')); wire(bat('-'), inv('DC-'), 'black');
        return doc;
      },
      steps: [
        { title: 'Connect the inverter', text: 'Battery + → fuse → inverter DC+ (battery − is already on DC−). A real 300 W inverter needs a 30–40 A fuse and 6 sq mm wire; here a 20 A fuse is enough for small loads.', check: c => c.read('inverter', 'running') === true, demo: [{ wire: ['fuse#0:2', 'inverter#0:DC+'] }] },
        { title: 'Plug in a 50 W table fan', text: 'Set the inverter’s AC load to 50 W. The battery current is about (50 ÷ 0.88 + 5) ÷ 12.6 ≈ 5 A.', check: c => Number(c.prop('inverter', 'watts')) === 50 && between(Number(c.read('inverter', 'idc')), 4, 6), demo: [{ set: 'inverter#0', props: { watts: 50 }, say: 'Tap the inverter → AC load: 50 W' }] },
        { title: 'Overload', text: 'Set the load to 350 W — more than the inverter can give. It trips and shuts down.', check: c => c.read('inverter', 'trip') === true, demo: [{ set: 'inverter#0', props: { watts: 350 }, say: 'Tap the inverter → AC load: 350 W' }] },
      ],
      tryIt: [['Wire the inverter to the controller’s LOAD terminals', 'its 25–40 A would overload a 10 A controller. Inverters go straight to the battery.']],
      quiz: [
        { q: 'Usable energy of a 26 Ah battery (to 50 %) is about…', options: ['13 Ah', '26 Ah', '52 Ah'], answer: 0, why: 'Lead-acid should only be used down to about half.' },
        { q: '≈5 A from 13 Ah lasts about…', options: ['26 hours', '2.6 hours', '15 minutes'], answer: 1, why: '13 Ah ÷ 5 A ≈ 2.6 h — the doc’s ~2.5 h for a 50 W fan.' },
        { q: 'Which can a 300 W inverter NOT run?', options: ['a 9 W LED bulb', 'a WiFi router', 'an electric kettle'], answer: 2, why: 'A kettle needs well over 1000 W.' },
      ],
    },
  ],
};

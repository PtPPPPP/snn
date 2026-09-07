# Rocket playable redesign

Approved direction: one-screen night recovery field, shared camera, wide touch throttle, same-course retry and concrete debrief. Keep the existing 10ms physics and real PPO actors.

Implemented: three selectable stages (practice, AI duel, fuel), common scene with scale-correct rockets and terrain, smoothed shared camera, input zone supporting direct touch and keyboard range, fuel bars, optional synthesized engine sound, pause, same-height retry, separate new-course action, first-commanded-ignition altitude comparison, optional learning section with return navigation.

Source examples inspected for design ideas: ehmorris/lunar-lander, tblazevic/moonlander. No source or artwork copied from those repositories.

Validation: experience helper tests (same-course reset, shared camera, first ignition), existing physics and actor parity fixtures, lint/build, 390px browser checks and direct mid-track input. Production remains unchanged.

import { updatePricesForAllChargers } from "./engine.ts";

export function schedulePricingUpdates() {
  const oneHour = 60 * 60 * 1000;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await updatePricesForAllChargers();
    } catch (e) {
      console.error(e);
    } finally {
      running = false;
    }
  };

  tick();
  setInterval(tick, oneHour);
}

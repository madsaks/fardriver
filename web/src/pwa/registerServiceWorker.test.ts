import { registerServiceWorker } from "./registerServiceWorker";

it("registers the app service worker when supported", async () => {
  const update = vi.fn().mockResolvedValue(undefined);
  const addEventListener = vi.fn();
  const register = vi.fn().mockResolvedValue({ update });
  vi.stubGlobal("navigator", {
    serviceWorker: { addEventListener, register },
  });

  await registerServiceWorker();

  expect(addEventListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));
  expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  expect(update).toHaveBeenCalled();
});

it("does nothing when service workers are unavailable", async () => {
  vi.stubGlobal("navigator", {});

  await expect(registerServiceWorker()).resolves.toBeUndefined();
});

export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  let refreshedForNewWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshedForNewWorker) {
      return;
    }
    refreshedForNewWorker = true;
    window.location.reload();
  });

  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await registration.update();
}

"use client";

export type PermissionState = NotificationPermission | "unsupported";

export function notificationSupport(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (notificationSupport() === "unsupported") return "unsupported";
  const result = await Notification.requestPermission();
  if (result === "granted") await registerServiceWorker();
  return result;
}

/**
 * Show a browser (OS-level) notification from the open app.
 * Works while a tab of the app is open (even in the background). It cannot fire
 * when the app is closed — that would require Web Push, which is not configured.
 */
export async function showBrowserNotification(title: string, body: string, url = "/dashboard"): Promise<boolean> {
  if (notificationSupport() !== "granted") return false;
  const options: NotificationOptions = { body, icon: "/icon.svg", tag: `gbt-${title}`, data: { url } };
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

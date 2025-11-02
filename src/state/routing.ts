import { signal } from "@preact/signals";

export const currentTab = signal(2);

export const setTab = (t: number) => currentTab.value = t
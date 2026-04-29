import { mediaflowUsageStore } from '$lib/stores/mediaflow-usage.svelte';
import { fetchMediaFlowApi } from './mediaflow-auth';

export async function fetchMediaFlowBillableApi(
  path: string,
  init: RequestInit | (() => RequestInit | Promise<RequestInit>),
): Promise<Response> {
  const response = await fetchMediaFlowApi(path, init);
  if (response.ok) {
    mediaflowUsageStore.scheduleRefresh();
  }
  return response;
}

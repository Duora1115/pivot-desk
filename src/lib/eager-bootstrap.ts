export function observeEagerBootstrap(bootstrap: Promise<void>, onError: (error: unknown) => void): Promise<void> {
  return bootstrap.catch(onError);
}

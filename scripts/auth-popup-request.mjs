export function authPopupRequestHeaders(headers, host) {
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) requestHeaders.append(key, item);
    } else {
      requestHeaders.set(key, value);
    }
  }
  requestHeaders.set("host", host);
  return requestHeaders;
}

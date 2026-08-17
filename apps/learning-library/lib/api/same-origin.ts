export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const submitted = new URL(origin);
    const target = new URL(request.url);
    if (submitted.origin === target.origin) return true;

    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return loopbackHosts.has(submitted.hostname)
      && loopbackHosts.has(target.hostname)
      && submitted.protocol === target.protocol
      && submitted.port === target.port;
  } catch {
    return false;
  }
}

export function developmentAppOrigin(
  request: Request,
  environment = process.env.NODE_ENV,
): string | null {
  if (environment !== "development") return null;
  const origin = request.headers.get("origin");
  if (!origin) return null;

  try {
    const submitted = new URL(origin);
    const target = new URL(request.url);
    const previewPorts = new Set(["8081", "8082", "19006"]);
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    const privateIpv4 = (hostname: string) => {
      const octets = hostname.split(".").map(Number);
      if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
      return octets[0] === 10
        || (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31)
        || (octets[0] === 192 && octets[1] === 168);
    };
    const submittedIsLocal = loopbackHosts.has(submitted.hostname) || privateIpv4(submitted.hostname);
    const targetIsLocal = loopbackHosts.has(target.hostname) || privateIpv4(target.hostname);
    const equivalentHost = submitted.hostname === target.hostname
      || (submittedIsLocal && targetIsLocal);

    return submitted.protocol === "http:"
      && target.protocol === "http:"
      && equivalentHost
      && target.port === "3031"
      && previewPorts.has(submitted.port)
      ? submitted.origin
      : null;
  } catch {
    return null;
  }
}

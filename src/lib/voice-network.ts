interface IceCandidate extends RTCStats {
  candidateType?: string;
  protocol?: string;
  relayProtocol?: string;
}

interface RemoteAudioStats extends RTCStats {
  roundTripTime?: number;
  packetsLost?: number;
}

function secondsToMs(seconds: number | undefined): number | null {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0
    ? Math.round(seconds * 1000)
    : null;
}

function readSelectedPath(report: RTCStatsReport) {
  for (const stat of report.values()) {
    if (stat.type !== "transport") continue;
    const { selectedCandidatePairId } = stat as RTCTransportStats;
    if (!selectedCandidatePairId) continue;

    const pair = report.get(selectedCandidatePairId) as RTCIceCandidatePairStats | undefined;
    if (pair?.type !== "candidate-pair") continue;

    const local = report.get(pair.localCandidateId) as IceCandidate | undefined;
    const remote = report.get(pair.remoteCandidateId) as IceCandidate | undefined;
    const relay = local?.candidateType === "relay" || remote?.candidateType === "relay";
    const relayProtocol = local?.relayProtocol?.toUpperCase();
    const transport = relay
      ? (relayProtocol ? `TURN/${relayProtocol}` : "TURN")
      : (local?.protocol ?? remote?.protocol)?.toUpperCase() ?? null;

    return { pingMs: secondsToMs(pair.currentRoundTripTime), transport };
  }

  return null;
}

export function summarizeVoiceNetwork(reports: RTCStatsReport[]) {
  let selectedPingMs: number | null = null;
  let audioPingMs: number | null = null;
  let transport: string | null = null;
  let packetsSent = 0;
  let packetsLost = 0;

  for (const report of reports) {
    const selected = readSelectedPath(report);
    if (selectedPingMs === null && selected?.pingMs != null) {
      selectedPingMs = selected.pingMs;
      transport = selected.transport;
    } else if (selectedPingMs === null) {
      transport ??= selected?.transport ?? null;
    }

    for (const stat of report.values()) {
      if (stat.type !== "outbound-rtp" || stat.kind !== "audio") continue;
      const outbound = stat as RTCOutboundRtpStreamStats;
      if (!outbound.remoteId) continue;
      const remote = report.get(outbound.remoteId) as RemoteAudioStats | undefined;
      if (remote?.type !== "remote-inbound-rtp") continue;

      audioPingMs ??= secondsToMs(remote.roundTripTime);
      if (
        typeof outbound.packetsSent === "number" &&
        Number.isFinite(outbound.packetsSent) &&
        typeof remote.packetsLost === "number" &&
        Number.isFinite(remote.packetsLost)
      ) {
        packetsSent += outbound.packetsSent;
        packetsLost += Math.max(0, remote.packetsLost);
      }
    }
  }

  return {
    pingMs: selectedPingMs ?? audioPingMs,
    transport,
    packetLossPct: packetsSent > 0 ? Math.min(100, (packetsLost / packetsSent) * 100) : null,
  };
}

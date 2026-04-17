import type {
  GamePhaseResultPayload,
  ResolvedSubmissionPhase,
} from '@/domain/game/phase-results.ts';
import { getPublicAppUrl } from './config.ts';

export type MessageNotificationInput = {
  roomId: string;
  roomName: string;
  threadId: string;
  threadLabel: string;
  senderName: string;
  messageBody: string;
  messageKind: 'text' | 'order_proposal';
};

export type PhaseResultNotificationInput = {
  roomId: string;
  roomName: string;
  payload: GamePhaseResultPayload;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

function messageUrl(roomId: string, threadId: string): string {
  const base = getPublicAppUrl().replace(/\/$/, '');
  return `${base}/rooms/${roomId}?thread=${threadId}`;
}

function roomUrl(roomId: string): string {
  const base = getPublicAppUrl().replace(/\/$/, '');
  return `${base}/rooms/${roomId}`;
}

function phaseLabel(phase: ResolvedSubmissionPhase): string {
  switch (phase) {
    case 'order_submission':
      return 'Orders';
    case 'retreat_submission':
      return 'Retreats';
    case 'build_submission':
      return 'Builds & disbands';
  }
}

function seasonLabel(season: string): string {
  return season === 'spring' ? 'Spring' : 'Fall';
}

export function renderMessageEmail(input: MessageNotificationInput): {
  subject: string;
  html: string;
  text: string;
} {
  const isOrderProposal = input.messageKind === 'order_proposal';
  const bodyPreview = isOrderProposal
    ? `Order proposal: ${truncate(input.messageBody, 200)}`
    : truncate(input.messageBody, 300);

  const subjectSnippet = truncate(
    input.messageBody.replace(/\s+/g, ' ').trim(),
    80,
  );
  const subjectAction = isOrderProposal
    ? `${input.senderName} proposed an order`
    : input.senderName;
  const subjectLead = `${subjectAction} in ${input.threadLabel} (${input.roomName})`;
  const subject =
    subjectSnippet.length > 0
      ? `${subjectLead}: ${subjectSnippet}`
      : subjectLead;

  const url = messageUrl(input.roomId, input.threadId);

  const text = [
    `${input.senderName} sent a new message in ${input.roomName}.`,
    `Thread: ${input.threadLabel}`,
    isOrderProposal ? 'Type: Order proposal' : null,
    '',
    bodyPreview,
    '',
    `Reply: ${url}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const html = `<!doctype html>
<html>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f4f5;padding:24px;margin:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:13px;color:#6b7280;">${escapeHtml(input.roomName)} — ${escapeHtml(input.threadLabel)}${isOrderProposal ? ' — Order proposal' : ''}</div>
        <div style="font-size:18px;font-weight:600;color:#111827;margin-top:4px;">New message from ${escapeHtml(input.senderName)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 28px;font-size:15px;color:#1f2937;line-height:1.5;white-space:pre-wrap;">${escapeHtml(bodyPreview)}</td>
    </tr>
    <tr>
      <td style="padding:0 28px 24px;">
        <a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:500;font-size:14px;">Open thread</a>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

export function renderMessagePush(input: MessageNotificationInput): {
  title: string;
  body: string;
  url: string;
  tag: string;
} {
  return {
    title: `${input.senderName} — ${input.roomName}`,
    body: truncate(
      input.messageKind === 'order_proposal'
        ? `Order proposal: ${input.messageBody}`
        : input.messageBody,
      160,
    ),
    url: messageUrl(input.roomId, input.threadId),
    tag: `message:${input.threadId}`,
  };
}

function phaseResultSummaryLines(payload: GamePhaseResultPayload): string[] {
  const lines: string[] = [];
  if (payload.headline) {
    lines.push(payload.headline);
  }
  if (payload.winnerPower) {
    const winner =
      payload.winnerPower[0]!.toUpperCase() + payload.winnerPower.slice(1);
    lines.push(`${winner} has won the game.`);
  }
  return lines;
}

function capitalizePower(power: string): string {
  return power.length === 0 ? power : power[0]!.toUpperCase() + power.slice(1);
}

type PhaseHighlight = { label: string; items: string[] };

function phaseResultHighlights(
  payload: GamePhaseResultPayload,
): PhaseHighlight[] {
  const highlights: PhaseHighlight[] = [];
  const maxItemsPerGroup = 6;

  for (const alert of payload.alerts ?? []) {
    const items = alert.items
      .slice(0, maxItemsPerGroup)
      .map((item) =>
        item.detail ? `${item.summary} — ${item.detail}` : item.summary,
      );
    if (items.length > 0) {
      const overflow = alert.items.length - items.length;
      if (overflow > 0) items.push(`…and ${overflow} more`);
      highlights.push({ label: alert.title, items });
    }
  }

  for (const group of payload.groups) {
    const items = group.items
      .slice(0, maxItemsPerGroup)
      .map((item) =>
        item.detail ? `${item.summary} — ${item.detail}` : item.summary,
      );
    if (items.length > 0) {
      const overflow = group.items.length - items.length;
      if (overflow > 0) items.push(`…and ${overflow} more`);
      highlights.push({ label: group.title, items });
    }
  }

  return highlights;
}

export function renderPhaseResultEmail(input: PhaseResultNotificationInput): {
  subject: string;
  html: string;
  text: string;
} {
  const { payload } = input;
  const season = seasonLabel(payload.season);
  const phase = phaseLabel(payload.phase);
  const subjectBase = `${season} ${payload.year} ${phase} resolved — ${input.roomName}`;
  const subject = payload.winnerPower
    ? `${subjectBase} — ${capitalizePower(payload.winnerPower)} wins`
    : subjectBase;
  const url = roomUrl(input.roomId);
  const summaryLines = phaseResultSummaryLines(payload);
  const summary =
    summaryLines.length > 0
      ? summaryLines.join(' ')
      : `${phase} have been adjudicated. Open the board to review.`;
  const narration = payload.historicalNarration?.trim() ?? '';
  const narrationParagraphs = narration
    ? narration.split(/\n\s*\n/g).filter((p) => p.trim().length > 0)
    : [];
  const highlights = phaseResultHighlights(payload);

  const textSections: string[] = [
    `${season} ${payload.year} — ${phase} resolved in ${input.roomName}`,
    '',
    summary,
  ];

  if (narrationParagraphs.length > 0) {
    textSections.push('', 'Historical narration:', ...narrationParagraphs);
  }

  if (highlights.length > 0) {
    textSections.push('');
    for (const highlight of highlights) {
      textSections.push(`${highlight.label}:`);
      for (const item of highlight.items) {
        textSections.push(`  • ${item}`);
      }
      textSections.push('');
    }
  }

  textSections.push(`View board: ${url}`);
  const text = textSections.join('\n');

  const narrationHtml =
    narrationParagraphs.length > 0
      ? `<tr>
      <td style="padding:0 28px 20px;font-size:14px;color:#1f2937;line-height:1.6;">
        <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;margin-bottom:8px;">Historical narration</div>
        ${narrationParagraphs
          .map(
            (p) =>
              `<p style="margin:0 0 10px;white-space:pre-wrap;">${escapeHtml(p)}</p>`,
          )
          .join('\n        ')}
      </td>
    </tr>`
      : '';

  const highlightsHtml =
    highlights.length > 0
      ? `<tr>
      <td style="padding:0 28px 20px;font-size:14px;color:#1f2937;line-height:1.5;">
        ${highlights
          .map(
            (highlight) => `<div style="margin-bottom:14px;">
          <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;margin-bottom:6px;">${escapeHtml(highlight.label)}</div>
          <ul style="margin:0;padding-left:18px;">${highlight.items
            .map(
              (item) =>
                `<li style="margin-bottom:2px;">${escapeHtml(item)}</li>`,
            )
            .join('')}</ul>
        </div>`,
          )
          .join('\n        ')}
      </td>
    </tr>`
      : '';

  const html = `<!doctype html>
<html>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f4f5;padding:24px;margin:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:13px;color:#6b7280;">${escapeHtml(input.roomName)}</div>
        <div style="font-size:18px;font-weight:600;color:#111827;margin-top:4px;">${escapeHtml(season)} ${payload.year} — ${escapeHtml(phase)} resolved</div>
        ${payload.winnerPower ? `<div style="font-size:13px;color:#047857;margin-top:6px;font-weight:500;">${escapeHtml(capitalizePower(payload.winnerPower))} has won the game</div>` : ''}
      </td>
    </tr>
    <tr>
      <td style="padding:20px 28px;font-size:15px;color:#1f2937;line-height:1.5;">${escapeHtml(summary)}</td>
    </tr>
    ${narrationHtml}
    ${highlightsHtml}
    <tr>
      <td style="padding:0 28px 24px;">
        <a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:500;font-size:14px;">Review the board</a>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

export function renderPhaseResultPush(input: PhaseResultNotificationInput): {
  title: string;
  body: string;
  url: string;
  tag: string;
} {
  const { payload } = input;
  const season = seasonLabel(payload.season);
  const phase = phaseLabel(payload.phase);
  const summaryLines = phaseResultSummaryLines(payload);
  const body =
    summaryLines.length > 0
      ? truncate(summaryLines.join(' '), 160)
      : `${phase} have been adjudicated.`;

  return {
    title: `${season} ${payload.year} ${phase} — ${input.roomName}`,
    body,
    url: roomUrl(input.roomId),
    tag: `phase-result:${input.roomId}:${payload.turnNumber}:${payload.phase}`,
  };
}

export type SignupOtpEmailInput = {
  otp: string;
  ttlMinutes: number;
};

export function renderSignupOtpEmail(input: SignupOtpEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your sign-up code: ${input.otp}`;

  const text = [
    'Use this code to finish creating your Diplomacy account:',
    '',
    input.otp,
    '',
    `This code expires in ${input.ttlMinutes} minutes. If you did not request it, you can ignore this email.`,
  ].join('\n');

  const html = `<!doctype html>
<html>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f4f5;padding:24px;margin:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.12em;">Confirm your email</div>
        <div style="font-size:18px;font-weight:600;color:#111827;margin-top:4px;">Finish creating your account</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;font-size:15px;color:#1f2937;line-height:1.5;">
        Enter this code on the sign-up page to confirm your email:
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 8px;text-align:center;">
        <div style="display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;letter-spacing:0.4em;font-weight:600;color:#111827;background:#f3f4f6;border-radius:8px;padding:14px 22px;">${escapeHtml(input.otp)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 24px;font-size:13px;color:#6b7280;line-height:1.5;">
        This code expires in ${input.ttlMinutes} minutes. If you did not request it, you can ignore this email.
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

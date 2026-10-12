export function isLiveBallAnnouncement(text: string, category?: string): boolean {
  return category === 'TURNOVER' || category === 'FUMBLE' ||
    /INTERCEPT|TURNOVER|FUMBLE|PICKED OFF/i.test(text);
}

export function shouldShowAnnouncement(text: string, category?: string): boolean {
  const upper = text.toUpperCase();
  const hiddenCalls = [
    'DEFENDING:', 'PLAY NOT IN TEAM PLAYBOOK', 'SCHEME NOT IN TEAM PLAYBOOK',
    'DEFENSE CALLED', 'DEFENSE ANTICIPATED', 'SPECIAL TEAMS:', 'PASS ROUTE:',
    'PASS PROTECTION:', 'RUN PLAY:', 'AUDIBLE', 'TEAM PLAYBOOK UPDATED'
  ];
  if (hiddenCalls.some(call => upper.includes(call))) return false;
  if (isLiveBallAnnouncement(text, category) || category === 'SAFETY') return true;

  const ordinaryResult = category === 'SACK' || [
    'SACK!', 'PASS INCOMPLETE', 'GAIN OF ', 'RETURN FOR ', 'TOUCHBACK!', 'PUNT COMPLETE'
  ].some(result => upper.includes(result));
  return !ordinaryResult || upper.includes('FIRST DOWN') || upper.includes('TOUCHDOWN');
}

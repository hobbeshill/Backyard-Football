import type { TeamProfile } from './teams';

export interface HelmetDesign {
  shell: string;
  // Stripe colors run left to right across the crown.
  centerStripe: string[];
  stripeWidths?: number[];
  decalMark: string;
  decalColor: string;
  decalBackground?: string;
  decalShape?: 'oval' | 'longhorn';
  facemask: string;
}

const HELMET_DESIGNS: Record<string, HelmetDesign> = {
  ALABAMA: { shell: '#9E1B32', centerStripe: ['#FFFFFF'], decalMark: '12', decalColor: '#FFFFFF', facemask: '#D5D9D8' },
  ARKANSAS: { shell: '#9D2235', centerStripe: [], decalMark: '', decalColor: '#FFFFFF', facemask: '#D5D9D8' },
  AUBURN: { shell: '#FFFFFF', centerStripe: ['#0C2340', '#FFFFFF', '#E87722', '#FFFFFF', '#0C2340'], stripeWidths: [3, 1, 4, 1, 3], decalMark: 'AU', decalColor: '#0C2340', facemask: '#D5D9D8' },
  FLORIDA: { shell: '#FA4616', centerStripe: ['#FFFFFF', '#0021A5', '#FFFFFF'], decalMark: '', decalColor: '#0021A5', facemask: '#D5D9D8' },
  GEORGIA: { shell: '#BA0C2F', centerStripe: ['#000000', '#FFFFFF', '#000000'], decalMark: 'G', decalColor: '#000000', decalBackground: '#FFFFFF', decalShape: 'oval', facemask: '#D5D9D8' },
  KENTUCKY: { shell: '#0033A0', centerStripe: ['#FFFFFF'], decalMark: 'UK', decalColor: '#FFFFFF', facemask: '#D5D9D8' },
  LSU: { shell: '#FDD023', centerStripe: ['#461D7C', '#FFFFFF', '#461D7C'], decalMark: 'LSU', decalColor: '#461D7C', facemask: '#461D7C' },
  MISSISSIPPI_STATE: { shell: '#5D1725', centerStripe: ['#FFFFFF'], decalMark: '', decalColor: '#FFFFFF', facemask: '#D5D9D8' },
  MISSOURI: { shell: '#101820', centerStripe: ['#F1B82D'], decalMark: '', decalColor: '#F1B82D', facemask: '#D5D9D8' },
  OKLAHOMA: { shell: '#841617', centerStripe: ['#FFFFFF'], decalMark: 'OU', decalColor: '#FFFFFF', facemask: '#D5D9D8' },
  OLE_MISS: { shell: '#65A7CD', centerStripe: ['#CE1126'], decalMark: '', decalColor: '#CE1126', facemask: '#D5D9D8' },
  SOUTH_CAROLINA: { shell: '#73000A', centerStripe: ['#000000', '#FFFFFF', '#000000'], decalMark: '', decalColor: '#FFFFFF', facemask: '#D5D9D8' },
  TENNESSEE: { shell: '#FF8200', centerStripe: ['#FFFFFF'], decalMark: 'T', decalColor: '#FFFFFF', facemask: '#D5D9D8' },
  TEXAS: { shell: '#FFFFFF', centerStripe: ['#BF5700'], decalMark: '', decalColor: '#BF5700', decalShape: 'longhorn', facemask: '#D5D9D8' },
  TEXAS_AM: { shell: '#500000', centerStripe: [], decalMark: 'ATM', decalColor: '#FFFFFF', facemask: '#D5D9D8' },
  VANDERBILT: { shell: '#101820', centerStripe: ['#CFAE70', '#FFFFFF', '#CFAE70'], decalMark: '', decalColor: '#CFAE70', facemask: '#D5D9D8' }
};

export function getHelmetDesign(team: TeamProfile): HelmetDesign {
  return HELMET_DESIGNS[team.id] ?? {
    shell: team.primaryColor,
    centerStripe: [team.secondaryColor],
    decalMark: '',
    decalColor: '#FFFFFF',
    facemask: '#D5D9D8'
  };
}

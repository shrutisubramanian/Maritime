export interface PortItem {
  id: string;
  value: string;
  name: string;
  shortName: string;
  state: string;
  category: 'Major' | 'Non-Major / Commercial';
  description?: string;
  aliases: string[];
}

export const INDIAN_PORTS: PortItem[] = [
  // Major Ports
  {
    id: 'kandla',
    value: 'Kandla',
    name: 'Deendayal Port (Kandla) [Gujarat]',
    shortName: 'Kandla',
    state: 'Gujarat',
    category: 'Major',
    aliases: ['Deendayal Port', 'Kandla', 'Deendayal']
  },
  {
    id: 'mumbai',
    value: 'Mumbai',
    name: 'Mumbai Port [Maharashtra]',
    shortName: 'Mumbai',
    state: 'Maharashtra',
    category: 'Major',
    aliases: ['Mumbai Port', 'Mumbai', 'Bombay']
  },
  {
    id: 'jnpt',
    value: 'JNPT',
    name: 'Jawaharlal Nehru Port (JNPT / Nhava Sheva) [Maharashtra]',
    shortName: 'JNPT',
    state: 'Maharashtra',
    category: 'Major',
    aliases: ['Jawaharlal Nehru Port', 'JNPT', 'Nhava Sheva']
  },
  {
    id: 'mormugao',
    value: 'Mormugao',
    name: 'Mormugao Port [Goa]',
    shortName: 'Mormugao',
    state: 'Goa',
    category: 'Major',
    aliases: ['Mormugao Port', 'Mormugao', 'Goa']
  },
  {
    id: 'mangalore',
    value: 'Mangalore',
    name: 'New Mangalore Port [Karnataka]',
    shortName: 'Mangalore',
    state: 'Karnataka',
    category: 'Major',
    aliases: ['New Mangalore Port', 'Mangalore', 'New Mangalore']
  },
  {
    id: 'cochin',
    value: 'Cochin',
    name: 'Cochin Port [Kerala]',
    shortName: 'Cochin',
    state: 'Kerala',
    category: 'Major',
    aliases: ['Cochin Port', 'Cochin', 'Kochi']
  },
  {
    id: 'kolkata',
    value: 'Kolkata',
    name: 'Syama Prasad Mookerjee Port (Kolkata & Haldia) [West Bengal]',
    shortName: 'Kolkata / Haldia',
    state: 'West Bengal',
    category: 'Major',
    description: 'Kolkata including Haldia dock',
    aliases: ['Syama Prasad Mookerjee Port', 'Kolkata Port', 'Haldia Dock', 'Kolkata', 'Haldia']
  },
  {
    id: 'paradip',
    value: 'Paradip',
    name: 'Paradip Port [Odisha]',
    shortName: 'Paradip',
    state: 'Odisha',
    category: 'Major',
    aliases: ['Paradip Port', 'Paradip', 'Paradeep']
  },
  {
    id: 'visakhapatnam',
    value: 'Visakhapatnam',
    name: 'Visakhapatnam Port [Andhra Pradesh]',
    shortName: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    category: 'Major',
    aliases: ['Visakhapatnam Port', 'Visakhapatnam', 'Vizag']
  },
  {
    id: 'chennai',
    value: 'Chennai',
    name: 'Chennai Port [Tamil Nadu]',
    shortName: 'Chennai',
    state: 'Tamil Nadu',
    category: 'Major',
    aliases: ['Chennai Port', 'Chennai', 'Madras']
  },
  {
    id: 'ennore',
    value: 'Ennore',
    name: 'Kamarajar Port (formerly Ennore) [Tamil Nadu]',
    shortName: 'Ennore',
    state: 'Tamil Nadu',
    category: 'Major',
    aliases: ['Kamarajar Port', 'Ennore Port', 'Ennore', 'Kamarajar']
  },
  {
    id: 'tuticorin',
    value: 'Tuticorin',
    name: 'V.O. Chidambaranar Port (Tuticorin) [Tamil Nadu]',
    shortName: 'Tuticorin',
    state: 'Tamil Nadu',
    category: 'Major',
    aliases: ['V.O. Chidambaranar Port', 'Tuticorin Port', 'Tuticorin', 'Thoothukudi', 'VOC Port']
  },

  // Non-Major / Operating / Commercial Ports
  {
    id: 'mundra',
    value: 'Mundra',
    name: 'Mundra Port [Gujarat]',
    shortName: 'Mundra',
    state: 'Gujarat',
    category: 'Non-Major / Commercial',
    description: "India's largest private and commercial operating port",
    aliases: ['Mundra Port', 'Mundra', 'Adani Mundra']
  },
  {
    id: 'dahej',
    value: 'Dahej',
    name: 'Dahej Port [Gujarat]',
    shortName: 'Dahej',
    state: 'Gujarat',
    category: 'Non-Major / Commercial',
    aliases: ['Dahej Port', 'Dahej']
  },
  {
    id: 'hazira',
    value: 'Hazira',
    name: 'Hazira Port [Gujarat]',
    shortName: 'Hazira',
    state: 'Gujarat',
    category: 'Non-Major / Commercial',
    aliases: ['Hazira Port', 'Hazira']
  },
  {
    id: 'pipavav',
    value: 'Pipavav',
    name: 'Pipavav Port [Gujarat]',
    shortName: 'Pipavav',
    state: 'Gujarat',
    category: 'Non-Major / Commercial',
    aliases: ['Pipavav Port', 'Pipavav', 'APM Terminals Pipavav']
  },
  {
    id: 'jaigad',
    value: 'Jaigad',
    name: 'Jaigad Port [Maharashtra]',
    shortName: 'Jaigad',
    state: 'Maharashtra',
    category: 'Non-Major / Commercial',
    aliases: ['Jaigad Port', 'Jaigad', 'JSW Jaigad']
  },
  {
    id: 'dighi',
    value: 'Dighi',
    name: 'Dighi Port [Maharashtra]',
    shortName: 'Dighi',
    state: 'Maharashtra',
    category: 'Non-Major / Commercial',
    aliases: ['Dighi Port', 'Dighi']
  },
  {
    id: 'karwar',
    value: 'Karwar',
    name: 'Karwar Port [Karnataka]',
    shortName: 'Karwar',
    state: 'Karnataka',
    category: 'Non-Major / Commercial',
    aliases: ['Karwar Port', 'Karwar']
  },
  {
    id: 'krishnapatnam',
    value: 'Krishnapatnam',
    name: 'Krishnapatnam Port [Andhra Pradesh]',
    shortName: 'Krishnapatnam',
    state: 'Andhra Pradesh',
    category: 'Non-Major / Commercial',
    aliases: ['Krishnapatnam Port', 'Krishnapatnam']
  },
  {
    id: 'kakinada',
    value: 'Kakinada',
    name: 'Kakinada Port [Andhra Pradesh]',
    shortName: 'Kakinada',
    state: 'Andhra Pradesh',
    category: 'Non-Major / Commercial',
    aliases: ['Kakinada Port', 'Kakinada', 'Kakinada Deep Water Port']
  },
  {
    id: 'dhamra',
    value: 'Dhamra',
    name: 'Dhamra Port [Odisha]',
    shortName: 'Dhamra',
    state: 'Odisha',
    category: 'Non-Major / Commercial',
    aliases: ['Dhamra Port', 'Dhamra']
  },
  {
    id: 'gopalpur',
    value: 'Gopalpur',
    name: 'Gopalpur Port [Odisha]',
    shortName: 'Gopalpur',
    state: 'Odisha',
    category: 'Non-Major / Commercial',
    aliases: ['Gopalpur Port', 'Gopalpur']
  },
  {
    id: 'haldia',
    value: 'Haldia',
    name: 'Haldia Port [West Bengal]',
    shortName: 'Haldia',
    state: 'West Bengal',
    category: 'Major',
    aliases: ['Haldia Port', 'Haldia Dock']
  },

  // Intermediate / operating seaports (Indian coast)
  {
    id: 'okha',
    value: 'Okha',
    name: 'Okha Port [Gujarat]',
    shortName: 'Okha',
    state: 'Gujarat',
    category: 'Non-Major / Commercial',
    aliases: ['Okha Port', 'Okha']
  },
  {
    id: 'bhavnagar',
    value: 'Bhavnagar',
    name: 'Bhavnagar Port [Gujarat]',
    shortName: 'Bhavnagar',
    state: 'Gujarat',
    category: 'Non-Major / Commercial',
    aliases: ['Bhavnagar Port', 'Bhavnagar']
  },
  {
    id: 'bharuch',
    value: 'Bharuch',
    name: 'Bharuch Port [Gujarat]',
    shortName: 'Bharuch',
    state: 'Gujarat',
    category: 'Non-Major / Commercial',
    aliases: ['Bharuch Port', 'Bharuch']
  },
  {
    id: 'surat',
    value: 'Surat',
    name: 'Surat Port [Gujarat]',
    shortName: 'Surat',
    state: 'Gujarat',
    category: 'Non-Major / Commercial',
    aliases: ['Surat Port', 'Surat']
  },
  {
    id: 'veraval',
    value: 'Veraval',
    name: 'Veraval Port [Gujarat]',
    shortName: 'Veraval',
    state: 'Gujarat',
    category: 'Non-Major / Commercial',
    aliases: ['Veraval Port', 'Veraval']
  },
  {
    id: 'ratnagiri',
    value: 'Ratnagiri',
    name: 'Ratnagiri Port [Maharashtra]',
    shortName: 'Ratnagiri',
    state: 'Maharashtra',
    category: 'Non-Major / Commercial',
    aliases: ['Ratnagiri Port', 'Ratnagiri']
  },
  {
    id: 'kozhikode',
    value: 'Kozhikode',
    name: 'Kozhikode Port [Kerala]',
    shortName: 'Kozhikode',
    state: 'Kerala',
    category: 'Non-Major / Commercial',
    aliases: ['Kozhikode Port', 'Calicut']
  },
  {
    id: 'alappuzha',
    value: 'Alappuzha',
    name: 'Alappuzha Port [Kerala]',
    shortName: 'Alappuzha',
    state: 'Kerala',
    category: 'Non-Major / Commercial',
    aliases: ['Alappuzha Port', 'Alleppey']
  },
  {
    id: 'karaikal',
    value: 'Karaikal',
    name: 'Karaikal Port [Puducherry]',
    shortName: 'Karaikal',
    state: 'Puducherry',
    category: 'Non-Major / Commercial',
    aliases: ['Karaikal Port', 'Karaikal']
  },
  {
    id: 'nagapattinam',
    value: 'Nagapattinam',
    name: 'Nagapattinam Port [Tamil Nadu]',
    shortName: 'Nagapattinam',
    state: 'Tamil Nadu',
    category: 'Non-Major / Commercial',
    aliases: ['Nagapattinam Port', 'Nagapattinam']
  },
  {
    id: 'machilipatnam',
    value: 'Machilipatnam',
    name: 'Machilipatnam Port [Andhra Pradesh]',
    shortName: 'Machilipatnam',
    state: 'Andhra Pradesh',
    category: 'Non-Major / Commercial',
    aliases: ['Machilipatnam Port', 'Machilipatnam']
  }
];

export const QUICK_PORT_CHIPS = [
  'All Ports',
  'Kandla',
  'Mundra',
  'Dahej',
  'Hazira',
  'Pipavav',
  'Mumbai',
  'JNPT',
  'Jaigad',
  'Dighi',
  'Mormugao',
  'Mangalore',
  'Karwar',
  'Cochin',
  'Tuticorin',
  'Chennai',
  'Ennore',
  'Visakhapatnam',
  'Kakinada',
  'Krishnapatnam',
  'Paradip',
  'Dhamra',
  'Gopalpur',
  'Kolkata',
  'Haldia',
  'Okha',
  'Bhavnagar',
  'Bharuch',
  'Surat',
  'Veraval',
  'Ratnagiri',
  'Kozhikode',
  'Alappuzha',
  'Karaikal',
  'Nagapattinam',
  'Machilipatnam'
];

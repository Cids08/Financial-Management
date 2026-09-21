// Official Philippine Regions, Provinces, and Cities/Municipalities
// Structured for hierarchical cascading dropdown selection

export const PH_REGIONS = [
  {
    id: 'NCR',
    name: 'NCR - National Capital Region',
    provinces: [
      {
        name: 'Metro Manila (1st District - Manila)',
        cities: ['Manila City']
      },
      {
        name: 'Metro Manila (2nd District - East)',
        cities: ['Mandaluyong City', 'Marikina City', 'Pasig City', 'Quezon City', 'San Juan City']
      },
      {
        name: 'Metro Manila (3rd District - North / CAMANAVA)',
        cities: ['Caloocan City', 'Malabon City', 'Navotas City', 'Valenzuela City']
      },
      {
        name: 'Metro Manila (4th District - South)',
        cities: ['Las Piñas City', 'Makati City', 'Muntinlupa City', 'Parañaque City', 'Pasay City', 'Pateros', 'Taguig City']
      }
    ]
  },
  {
    id: 'CAR',
    name: 'CAR - Cordillera Administrative Region',
    provinces: [
      { name: 'Abra', cities: ['Bangued', 'Bucay', 'Dolores', 'La Paz', 'Tayum'] },
      { name: 'Apayao', cities: ['Conner', 'Flora', 'Kabugao', 'Luna', 'Pudtol'] },
      { name: 'Benguet', cities: ['Baguio City', 'La Trinidad', 'Itogon', 'Tuba', 'Tublay', 'Buguias'] },
      { name: 'Ifugao', cities: ['Lagawe', 'Banaue', 'Kiangan', 'Alfonso Lista', 'Mayoyao'] },
      { name: 'Kalinga', cities: ['Tabuk City', 'Balbalan', 'Lubuagan', 'Pasil', 'Pinukpuk'] },
      { name: 'Mountain Province', cities: ['Bontoc', 'Sagada', 'Bauko', 'Besao', 'Tadian'] }
    ]
  },
  {
    id: 'Region I',
    name: 'Region I - Ilocos Region',
    provinces: [
      { name: 'Ilocos Norte', cities: ['Laoag City', 'Batac City', 'San Nicolas', 'Dingras', 'Currimao'] },
      { name: 'Ilocos Sur', cities: ['Vigan City', 'Candon City', 'Narvacan', 'Tagudin', 'Cabugao'] },
      { name: 'La Union', cities: ['San Fernando City', 'Agoo', 'Bauang', 'Nagilian', 'San Juan'] },
      { name: 'Pangasinan', cities: ['Dagupan City', 'San Carlos City', 'Urdaneta City', 'Alaminos City', 'Lingayen', 'Rosales', 'Malasiqui'] }
    ]
  },
  {
    id: 'Region II',
    name: 'Region II - Cagayan Valley',
    provinces: [
      { name: 'Batanes', cities: ['Basco', 'Itbayat', 'Mahatao', 'Sabtang'] },
      { name: 'Cagayan', cities: ['Tuguegarao City', 'Aparri', 'Ballesteros', 'Gattaran', 'Lal-lo', 'Solana'] },
      { name: 'Isabela', cities: ['Ilagan City', 'Cauayan City', 'Santiago City', 'Roxas', 'Tumauini', 'San Mateo'] },
      { name: 'Nueva Vizcaya', cities: ['Bayombong', 'Solano', 'Aritao', 'Bambang', 'Bagabag'] },
      { name: 'Quirino', cities: ['Cabarroguis', 'Diffun', 'Maddela', 'Saguday', 'Aglipay'] }
    ]
  },
  {
    id: 'Region III',
    name: 'Region III - Central Luzon',
    provinces: [
      { name: 'Aurora', cities: ['Baler', 'Casiguran', 'Dilasag', 'Maria Aurora', 'San Luis'] },
      { name: 'Bataan', cities: ['Balanga City', 'Dinalupihan', 'Mariveles', 'Hermosa', 'Limay', 'Orion'] },
      { name: 'Bulacan', cities: ['Malolos City', 'Meycauayan City', 'San Jose del Monte City', 'Baliuag', 'Marilao', 'Santa Maria', 'Bocaue', 'Guiguinto'] },
      { name: 'Nueva Ecija', cities: ['Palayan City', 'Cabanatuan City', 'Gapan City', 'San Jose City', 'Science City of Muñoz', 'Talavera', 'Guimba'] },
      { name: 'Pampanga', cities: ['San Fernando City', 'Angeles City', 'Mabalacat City', 'Guagua', 'Lubao', 'Mexico', 'Arayat', 'Floridablanca'] },
      { name: 'Tarlac', cities: ['Tarlac City', 'Capas', 'Concepcion', 'Paniqui', 'Gerona', 'Camiling'] },
      { name: 'Zambales', cities: ['Olongapo City', 'Iba', 'Subic', 'Castillejos', 'San Marcelino', 'Botolan'] }
    ]
  },
  {
    id: 'Region IV-A',
    name: 'Region IV-A - CALABARZON',
    provinces: [
      { name: 'Batangas', cities: ['Batangas City', 'Lipa City', 'Tanauan City', 'Santo Tomas City', 'Nasugbu', 'Bauan', 'Balayan', 'Lemery'] },
      { name: 'Cavite', cities: ['Trece Martires City', 'Bacoor City', 'Cavite City', 'Dasmariñas City', 'General Trias City', 'Imus City', 'Tagaytay City', 'Silang', 'Kawit'] },
      { name: 'Laguna', cities: ['Santa Cruz', 'Biñan City', 'Cabuyao City', 'Calamba City', 'San Pablo City', 'San Pedro City', 'Santa Rosa City', 'Los Baños'] },
      { name: 'Quezon', cities: ['Lucena City', 'Tayabas City', 'Candelaria', 'Sariaya', 'Tiaong', 'Pagbilao', 'Gumaca', 'Lopez'] },
      { name: 'Rizal', cities: ['Antipolo City', 'Cainta', 'Taytay', 'Binangonan', 'San Mateo', 'Rodriguez (Montalban)', 'Angono', 'Tanay'] }
    ]
  },
  {
    id: 'MIMAROPA',
    name: 'MIMAROPA Region',
    provinces: [
      { name: 'Marinduque', cities: ['Boac', 'Gasan', 'Mogpog', 'Santa Cruz', 'Torrijos', 'Buenavista'] },
      { name: 'Occidental Mindoro', cities: ['Mamburao', 'San Jose', 'Sablayan', 'Abra de Ilog', 'Lubang'] },
      { name: 'Oriental Mindoro', cities: ['Calapan City', 'Naujan', 'Pinamalayan', 'Roxas', 'Victoria', 'Puerto Galera'] },
      { name: 'Palawan', cities: ['Puerto Princesa City', 'Coron', 'El Nido', 'Brooke\'s Point', 'Roxas', 'San Vicente', 'Narra'] },
      { name: 'Romblon', cities: ['Romblon', 'Odiongan', 'San Agustin', 'Cajidiocan', 'San Fernando'] }
    ]
  },
  {
    id: 'Region V',
    name: 'Region V - Bicol Region',
    provinces: [
      { name: 'Albay', cities: ['Legazpi City', 'Ligao City', 'Tabaco City', 'Daraga', 'Guinobatan', 'Polangui'] },
      { name: 'Camarines Norte', cities: ['Daet', 'Labo', 'Jose Panganiban', 'Basud', 'Capalonga'] },
      { name: 'Camarines Sur', cities: ['Naga City', 'Iriga City', 'Pili', 'Calabanga', 'Libmanan', 'Sipocot'] },
      { name: 'Catanduanes', cities: ['Virac', 'San Andres', 'Caramoran', 'Pandan', 'Bato'] },
      { name: 'Masbate', cities: ['Masbate City', 'Aroroy', 'Cataingan', 'Milagros', 'Placer'] },
      { name: 'Sorsogon', cities: ['Sorsogon City', 'Bulan', 'Gubat', 'Irosin', 'Casiguran'] }
    ]
  },
  {
    id: 'Region VI',
    name: 'Region VI - Western Visayas',
    provinces: [
      { name: 'Aklan', cities: ['Kalibo', 'Malay (Boracay)', 'Ibajay', 'New Washington', 'Banga'] },
      { name: 'Antique', cities: ['San Jose de Buenavista', 'Sibalom', 'Hamtic', 'Culasi', 'Tibiao'] },
      { name: 'Capiz', cities: ['Roxas City', 'Panay', 'Pontevedra', 'Dumarao', 'Mambusao'] },
      { name: 'Guimaras', cities: ['Jordan', 'Buenavista', 'Nueva Valencia', 'San Lorenzo', 'Sibunag'] },
      { name: 'Iloilo', cities: ['Iloilo City', 'Passi City', 'Oton', 'Pavia', 'Santa Barbara', 'Pototan', 'Dumangas', 'Carles'] },
      { name: 'Negros Occidental', cities: ['Bacolod City', 'Bago City', 'Cadiz City', 'Escalante City', 'Himamaylan City', 'Kabankalan City', 'La Carlota City', 'Sagay City', 'San Carlos City', 'Silay City', 'Sipalay City', 'Talisay City', 'Victorias City'] }
    ]
  },
  {
    id: 'Region VII',
    name: 'Region VII - Central Visayas',
    provinces: [
      { name: 'Bohol', cities: ['Tagbilaran City', 'Panglao', 'Tubigon', 'Talibon', 'Carmen', 'Ubay', 'Loon'] },
      { name: 'Cebu', cities: ['Cebu City', 'Mandaue City', 'Lapu-Lapu City', 'Talisay City', 'Toledo City', 'Danao City', 'Naga City', 'Carcar City', 'Bogo City', 'Consolacion', 'Liloan', 'Minglanilla'] },
      { name: 'Negros Oriental', cities: ['Dumaguete City', 'Bais City', 'Bayawan City', 'Canlaon City', 'Guihulngan City', 'Tanjay City', 'Sibulan'] },
      { name: 'Siquijor', cities: ['Siquijor', 'Larena', 'Lazi', 'San Juan', 'Enrique Villanueva', 'Maria'] }
    ]
  },
  {
    id: 'Region VIII',
    name: 'Region VIII - Eastern Visayas',
    provinces: [
      { name: 'Biliran', cities: ['Naval', 'Biliran', 'Cabucgayan', 'Caibiran', 'Kawayan'] },
      { name: 'Eastern Samar', cities: ['Borongan City', 'Guiuan', 'Dolores', 'Oras', 'Balangiga'] },
      { name: 'Leyte', cities: ['Tacloban City', 'Ormoc City', 'Baybay City', 'Palo', 'Tanauan', 'Carigara', 'Hilongos'] },
      { name: 'Northern Samar', cities: ['Catarman', 'Laoang', 'Allen', 'Palapag', 'Gamay'] },
      { name: 'Samar', cities: ['Catbalogan City', 'Calbayog City', 'Basey', 'Gandara', 'Wright'] },
      { name: 'Southern Leyte', cities: ['Maasin City', 'Sogod', 'Macrohon', 'Bontoc', 'Hinunangan'] }
    ]
  },
  {
    id: 'Region IX',
    name: 'Region IX - Zamboanga Peninsula',
    provinces: [
      { name: 'Zamboanga del Norte', cities: ['Dipolog City', 'Dapitan City', 'Sindangan', 'Labason', 'Siocon'] },
      { name: 'Zamboanga del Sur', cities: ['Pagadian City', 'Zamboanga City', 'Dumalinao', 'Molave', 'Aurora'] },
      { name: 'Zamboanga Sibugay', cities: ['Ipil', 'Titay', 'Kabasalan', 'Siay', 'Buug'] }
    ]
  },
  {
    id: 'Region X',
    name: 'Region X - Northern Mindanao',
    provinces: [
      { name: 'Bukidnon', cities: ['Malaybalay City', 'Valencia City', 'Maramag', 'Manolo Fortich', 'Quezon', 'Don Carlos'] },
      { name: 'Camiguin', cities: ['Mambajao', 'Catarman', 'Guinsiliban', 'Mahinog', 'Sagay'] },
      { name: 'Lanao del Norte', cities: ['Iligan City', 'Tubod', 'Kapatagan', 'Baroy', 'Lala'] },
      { name: 'Misamis Occidental', cities: ['Oroquieta City', 'Ozamiz City', 'Tangub City', 'Plaridel', 'Clarin', 'Jimenez'] },
      { name: 'Misamis Oriental', cities: ['Cagayan de Oro City', 'Gingoog City', 'El Salvador City', 'Opol', 'Tagoloan', 'Villanueva', 'Balingasag'] }
    ]
  },
  {
    id: 'Region XI',
    name: 'Region XI - Davao Region',
    provinces: [
      { name: 'Davao de Oro', cities: ['Nabunturan', 'Monkayo', 'Compostela', 'Pantukan', 'Mawab'] },
      { name: 'Davao del Norte', cities: ['Tagum City', 'Panabo City', 'Island Garden City of Samal', 'Carmen', 'Sto. Tomas'] },
      { name: 'Davao del Sur', cities: ['Davao City', 'Digos City', 'Santa Cruz', 'Bansalan', 'Matanao'] },
      { name: 'Davao Occidental', cities: ['Malita', 'Santa Maria', 'Don Marcelino', 'Jose Abad Santos', 'Sarangani'] },
      { name: 'Davao Oriental', cities: ['Mati City', 'Lupon', 'Baganga', 'Governor Generoso', 'Cateel'] }
    ]
  },
  {
    id: 'Region XII',
    name: 'Region XII - SOCCSKSARGEN',
    provinces: [
      { name: 'Cotabato', cities: ['Kidapawan City', 'Midsayap', 'Pikit', 'Kabacan', 'Carmen', 'Makilala'] },
      { name: 'Sarangani', cities: ['Alabel', 'Glan', 'Kiamba', 'Maasim', 'Maitum', 'Malapatan', 'Malungon'] },
      { name: 'South Cotabato', cities: ['Koronadal City', 'General Santos City', 'Polomolok', 'Surallah', 'Tupi', 'Banga'] },
      { name: 'Sultan Kudarat', cities: ['Isulan', 'Tacurong City', 'Esperanza', 'Lebak', 'Kalamansig'] }
    ]
  },
  {
    id: 'Region XIII',
    name: 'Region XIII - Caraga',
    provinces: [
      { name: 'Agusan del Norte', cities: ['Butuan City', 'Cabadbaran City', 'Buenavista', 'Nasipit', 'Carmen'] },
      { name: 'Agusan del Sur', cities: ['Prosperidad', 'San Francisco', 'Bayugan City', 'Trento', 'Bunawan'] },
      { name: 'Dinagat Islands', cities: ['San Jose', 'Basilisa', 'Cagdianao', 'Dinagat', 'Libjo'] },
      { name: 'Surigao del Norte', cities: ['Surigao City', 'Dapa (Siargao)', 'General Luna', 'Claver', 'Placer'] },
      { name: 'Surigao del Sur', cities: ['Tandag City', 'Bislig City', 'Cantilan', 'Hinatuan', 'Barobo'] }
    ]
  },
  {
    id: 'BARMM',
    name: 'BARMM - Bangsamoro Autonomous Region',
    provinces: [
      { name: 'Basilan', cities: ['Isabela City', 'Lamitan City', 'Maluso', 'Tuburan'] },
      { name: 'Lanao del Sur', cities: ['Marawi City', 'Wao', 'Malabang', 'Balabagan', 'Saguiaran'] },
      { name: 'Maguindanao del Norte', cities: ['Cotabato City', 'Datu Odin Sinsuat', 'Parang', 'Sultan Kudarat', 'Upi'] },
      { name: 'Maguindanao del Sur', cities: ['Buluan', 'Datu Paglas', 'Shariff Aguak', 'Ampatuan', 'Paglat'] },
      { name: 'Sulu', cities: ['Jolo', 'Indanan', 'Parang', 'Maimbung', 'Patikul'] },
      { name: 'Tawi-Tawi', cities: ['Bongao', 'Panglima Sugala', 'Simunul', 'Sitangkai', 'South Ubian'] }
    ]
  }
]

// Common international countries for cross-border suppliers & contractors
export const POPULAR_COUNTRIES = [
  'United States',
  'China',
  'Japan',
  'Singapore',
  'Taiwan',
  'South Korea',
  'Germany',
  'United Kingdom',
  'Australia',
  'Canada',
  'Hong Kong',
  'Malaysia',
  'Thailand',
  'Vietnam',
  'Indonesia',
  'India',
  'United Arab Emirates',
  'Saudi Arabia',
  'Italy',
  'France',
  'Netherlands',
  'Switzerland',
  'Spain',
  'New Zealand'
]


// Official Philippine Island Groups and simplified Regions
// Grouped cleanly by Island Group (Luzon, Visayas, Mindanao) to keep dropdowns short and fast to navigate

export const PH_ISLAND_GROUPS = [
  {
    group: 'Luzon',
    regions: [
      {
        id: 'NCR',
        name: 'Metro Manila (NCR)',
        provinces: [
          {
            name: 'Metro Manila',
            cities: [
              'Quezon City', 'Manila City', 'Makati City', 'Taguig City (BGC)', 'Pasig City (Ortigas)',
              'Mandaluyong City', 'Parañaque City', 'Caloocan City', 'Pasay City',
              'Las Piñas City', 'Muntinlupa City (Alabang)', 'Marikina City', 'Valenzuela City',
              'Malabon City', 'Navotas City', 'San Juan City', 'Pateros'
            ]
          }
        ]
      },
      {
        id: 'CAR',
        name: 'Cordillera (CAR - Baguio/Benguet)',
        provinces: [
          { name: 'Benguet', cities: ['Baguio City', 'La Trinidad', 'Itogon', 'Tuba'] },
          { name: 'Abra', cities: ['Bangued', 'Bucay', 'Dolores'] },
          { name: 'Apayao', cities: ['Conner', 'Flora', 'Kabugao'] },
          { name: 'Ifugao', cities: ['Lagawe', 'Banaue', 'Kiangan'] },
          { name: 'Kalinga', cities: ['Tabuk City', 'Balbalan'] },
          { name: 'Mountain Province', cities: ['Bontoc', 'Sagada'] }
        ]
      },
      {
        id: 'R1',
        name: 'Ilocos Region (Region I)',
        provinces: [
          { name: 'Pangasinan', cities: ['Dagupan City', 'San Carlos City', 'Urdaneta City', 'Alaminos City', 'Lingayen'] },
          { name: 'La Union', cities: ['San Fernando City', 'Agoo', 'Bauang', 'San Juan'] },
          { name: 'Ilocos Norte', cities: ['Laoag City', 'Batac City', 'San Nicolas'] },
          { name: 'Ilocos Sur', cities: ['Vigan City', 'Candon City', 'Narvacan'] }
        ]
      },
      {
        id: 'R2',
        name: 'Cagayan Valley (Region II)',
        provinces: [
          { name: 'Cagayan', cities: ['Tuguegarao City', 'Aparri', 'Lal-lo'] },
          { name: 'Isabela', cities: ['Ilagan City', 'Cauayan City', 'Santiago City'] },
          { name: 'Nueva Vizcaya', cities: ['Bayombong', 'Solano', 'Bambang'] },
          { name: 'Quirino', cities: ['Cabarroguis', 'Diffun'] },
          { name: 'Batanes', cities: ['Basco', 'Sabtang'] }
        ]
      },
      {
        id: 'R3',
        name: 'Central Luzon (Region III - Pampanga/Bulacan)',
        provinces: [
          { name: 'Pampanga', cities: ['San Fernando City', 'Angeles City', 'Mabalacat City', 'Clark Freeport', 'Guagua'] },
          { name: 'Bulacan', cities: ['Malolos City', 'Meycauayan City', 'San Jose del Monte City', 'Marilao', 'Santa Maria'] },
          { name: 'Bataan', cities: ['Balanga City', 'Mariveles', 'Dinalupihan', 'Subic Bay Freeport'] },
          { name: 'Zambales', cities: ['Olongapo City', 'Subic', 'Iba'] },
          { name: 'Tarlac', cities: ['Tarlac City', 'Capas', 'Concepcion'] },
          { name: 'Nueva Ecija', cities: ['Cabanatuan City', 'Palayan City', 'Gapan City', 'San Jose City'] },
          { name: 'Aurora', cities: ['Baler', 'Maria Aurora'] }
        ]
      },
      {
        id: 'R4A',
        name: 'CALABARZON (Region IV-A - Cavite/Laguna/Batangas)',
        provinces: [
          { name: 'Cavite', cities: ['Bacoor City', 'Dasmariñas City', 'Imus City', 'General Trias City', 'Tagaytay City', 'Trece Martires City', 'Silang'] },
          { name: 'Laguna', cities: ['Santa Rosa City', 'Calamba City', 'Biñan City', 'Cabuyao City', 'San Pedro City', 'San Pablo City', 'Los Baños'] },
          { name: 'Batangas', cities: ['Batangas City', 'Lipa City', 'Tanauan City', 'Santo Tomas City', 'Nasugbu', 'Bauan'] },
          { name: 'Rizal', cities: ['Antipolo City', 'Cainta', 'Taytay', 'Binangonan', 'San Mateo', 'Angono'] },
          { name: 'Quezon', cities: ['Lucena City', 'Tayabas City', 'Candelaria', 'Sariaya'] }
        ]
      },
      {
        id: 'MIMAROPA',
        name: 'MIMAROPA (Palawan/Mindoro)',
        provinces: [
          { name: 'Palawan', cities: ['Puerto Princesa City', 'Coron', 'El Nido'] },
          { name: 'Oriental Mindoro', cities: ['Calapan City', 'Naujan', 'Puerto Galera'] },
          { name: 'Occidental Mindoro', cities: ['San Jose', 'Mamburao'] },
          { name: 'Marinduque', cities: ['Boac', 'Santa Cruz'] },
          { name: 'Romblon', cities: ['Romblon', 'Odiongan'] }
        ]
      },
      {
        id: 'R5',
        name: 'Bicol Region (Region V - Naga/Legazpi)',
        provinces: [
          { name: 'Albay', cities: ['Legazpi City', 'Ligao City', 'Tabaco City', 'Daraga'] },
          { name: 'Camarines Sur', cities: ['Naga City', 'Iriga City', 'Pili'] },
          { name: 'Camarines Norte', cities: ['Daet', 'Labo'] },
          { name: 'Sorsogon', cities: ['Sorsogon City', 'Bulan'] },
          { name: 'Catanduanes', cities: ['Virac', 'San Andres'] },
          { name: 'Masbate', cities: ['Masbate City', 'Aroroy'] }
        ]
      }
    ]
  },
  {
    group: 'Visayas',
    regions: [
      {
        id: 'R6',
        name: 'Western Visayas (Region VI - Iloilo/Bacolod)',
        provinces: [
          { name: 'Iloilo', cities: ['Iloilo City', 'Passi City', 'Oton', 'Pavia'] },
          { name: 'Negros Occidental', cities: ['Bacolod City', 'Talisay City', 'Silay City', 'Bago City', 'Kabankalan City'] },
          { name: 'Aklan', cities: ['Kalibo', 'Malay (Boracay)'] },
          { name: 'Capiz', cities: ['Roxas City'] },
          { name: 'Antique', cities: ['San Jose de Buenavista'] },
          { name: 'Guimaras', cities: ['Jordan', 'Buenavista'] }
        ]
      },
      {
        id: 'R7',
        name: 'Central Visayas (Region VII - Cebu/Bohol)',
        provinces: [
          { name: 'Cebu', cities: ['Cebu City', 'Mandaue City', 'Lapu-Lapu City', 'Talisay City', 'Toledo City', 'Consolacion', 'Liloan'] },
          { name: 'Bohol', cities: ['Tagbilaran City', 'Panglao', 'Tubigon'] },
          { name: 'Negros Oriental', cities: ['Dumaguete City', 'Bais City'] },
          { name: 'Siquijor', cities: ['Siquijor', 'Larena'] }
        ]
      },
      {
        id: 'R8',
        name: 'Eastern Visayas (Region VIII - Tacloban/Ormoc)',
        provinces: [
          { name: 'Leyte', cities: ['Tacloban City', 'Ormoc City', 'Baybay City', 'Palo'] },
          { name: 'Samar', cities: ['Catbalogan City', 'Calbayog City'] },
          { name: 'Eastern Samar', cities: ['Borongan City', 'Guiuan'] },
          { name: 'Northern Samar', cities: ['Catarman'] },
          { name: 'Southern Leyte', cities: ['Maasin City'] },
          { name: 'Biliran', cities: ['Naval'] }
        ]
      }
    ]
  },
  {
    group: 'Mindanao',
    regions: [
      {
        id: 'R11',
        name: 'Davao Region (Region XI - Davao City)',
        provinces: [
          { name: 'Davao del Sur', cities: ['Davao City', 'Digos City', 'Santa Cruz'] },
          { name: 'Davao del Norte', cities: ['Tagum City', 'Panabo City', 'Samal City'] },
          { name: 'Davao de Oro', cities: ['Nabunturan', 'Monkayo'] },
          { name: 'Davao Oriental', cities: ['Mati City'] },
          { name: 'Davao Occidental', cities: ['Malita'] }
        ]
      },
      {
        id: 'R10',
        name: 'Northern Mindanao (Region X - Cagayan de Oro)',
        provinces: [
          { name: 'Misamis Oriental', cities: ['Cagayan de Oro City', 'Gingoog City'] },
          { name: 'Bukidnon', cities: ['Malaybalay City', 'Valencia City'] },
          { name: 'Lanao del Norte', cities: ['Iligan City', 'Tubod'] },
          { name: 'Misamis Occidental', cities: ['Ozamiz City', 'Oroquieta City'] },
          { name: 'Camiguin', cities: ['Mambajao'] }
        ]
      },
      {
        id: 'R12',
        name: 'SOCCSKSARGEN (Region XII - GenSan)',
        provinces: [
          { name: 'South Cotabato', cities: ['General Santos City', 'Koronadal City', 'Polomolok'] },
          { name: 'Cotabato', cities: ['Kidapawan City', 'Midsayap'] },
          { name: 'Sultan Kudarat', cities: ['Tacurong City', 'Isulan'] },
          { name: 'Sarangani', cities: ['Alabel', 'Glan'] }
        ]
      },
      {
        id: 'R9',
        name: 'Zamboanga Peninsula (Region IX - Zamboanga City)',
        provinces: [
          { name: 'Zamboanga del Sur', cities: ['Zamboanga City', 'Pagadian City'] },
          { name: 'Zamboanga del Norte', cities: ['Dipolog City', 'Dapitan City'] },
          { name: 'Zamboanga Sibugay', cities: ['Ipil'] }
        ]
      },
      {
        id: 'R13',
        name: 'Caraga (Region XIII - Butuan)',
        provinces: [
          { name: 'Agusan del Norte', cities: ['Butuan City', 'Cabadbaran City'] },
          { name: 'Surigao del Norte', cities: ['Surigao City', 'General Luna (Siargao)'] },
          { name: 'Surigao del Sur', cities: ['Tandag City', 'Bislig City'] },
          { name: 'Agusan del Sur', cities: ['Bayugan City', 'San Francisco'] },
          { name: 'Dinagat Islands', cities: ['San Jose'] }
        ]
      },
      {
        id: 'BARMM',
        name: 'Bangsamoro (BARMM - Cotabato/Marawi)',
        provinces: [
          { name: 'Maguindanao del Norte', cities: ['Cotabato City', 'Datu Odin Sinsuat'] },
          { name: 'Lanao del Sur', cities: ['Marawi City', 'Wao'] },
          { name: 'Basilan', cities: ['Isabela City', 'Lamitan City'] },
          { name: 'Sulu', cities: ['Jolo'] },
          { name: 'Tawi-Tawi', cities: ['Bongao'] }
        ]
      }
    ]
  }
]

// Flattened list of regions
export const ALL_REGIONS = PH_ISLAND_GROUPS.flatMap((g) => g.regions)

// Flattened search index of all Philippine cities & provinces for instantaneous 1-click search autocomplete
export const ALL_PH_SEARCH_LOCATIONS = []
ALL_REGIONS.forEach((region) => {
  region.provinces.forEach((province) => {
    province.cities.forEach((city) => {
      const isMetroManila = province.name === 'Metro Manila'
      const formatted = isMetroManila
        ? `${city}, Metro Manila`
        : `${city}, ${province.name}`

      ALL_PH_SEARCH_LOCATIONS.push({
        city,
        province: province.name,
        regionId: region.id,
        regionName: region.name,
        display: formatted,
        searchKey: `${city} ${province.name} ${region.name}`.toLowerCase(),
      })
    })
  })
})

// Common international countries
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
  'New Zealand'
]

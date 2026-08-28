/**
 * cities.js — Civ2 MGE city name lists per civilization.
 *
 * Source: CITY.TXT
 *
 * CITY_NAMES is indexed by civ ID (matching civs.js).
 * Cities are listed in order — the first city is always the capital.
 * When a civ runs out of names, fall through to EXTRA_CITIES.
 *
 * BARBARIAN_TRIBES — names for barbarian hordes on the map.
 * EXTRA_CITIES     — overflow names shared across civs.
 */

export const CITY_NAMES = [
  // 0 — Romans (Caesar / Livia)
  ['Rome','Veii','Antium','Cumae','Neapolis','Pompeii','Pisae','Ravenna','Hispalis',
   'Viroconium','Lugdunum','Lutetia','Byzantium','Brundisium','Syracuse','Caesaraugusta',
   'Palmyra','Jerusalem','Caesarea','Tarentum','Nicomedia','Seleucia','Artaxata',
   'Aurelianorum','Hippo Regius','Nicopolis','Londinium','Eburacum','Arretium','Gordion',
   'Agrippina','Cyrene','Tyrus','Verona','Corfinium','Mediolanum','Treveri','Sirmium',
   'Augustadorum','Trapezus','Bagacum','Lauriacum','Teurnia','Curia'],

  // 1 — Babylonians (Hammurabi / Ishtari)
  ['Babylon','Ur','Nineveh','Ashur','Ellipi','Akkad','Uruk','Eridu','Samarra','Lagash',
   'Kish','Nippur','Shuruppak','Zariqum','Sippar','Izibia','Larsa','Nimrud','Zamua',
   'Khorsabad','Hindana','Tell Wilaya','Umma','Adab','Telloh','Nina','Ebla'],

  // 2 — Germans (Frederick / Maria Theresa)
  ['Berlin','Leipzig','Hamburg','Konigsberg','Frankfurt','Munich','Heidelburg','Nuremberg',
   'Cologne','Hannover','Bremen','Stuttgart','Bonn','Salzburg','Dortmund','Brandenburg'],

  // 3 — Egyptians (Ramesses / Cleopatra)
  ['Thebes','Memphis','Heliopolis','Elephantine','Alexandria','Pi-Ramesses','Giza','Byblos',
   'El-Amarna','Hieraconpolis','Abydos','Asyut','Avaris','Lisht','Buto','Edfu','Pithom',
   'Busiris','Kahun','Athribis','Mendes','El-Ashmunein','Tanis','Buhen','Bubastis',
   'This','Oryx','Sebennytus','Cairo'],

  // 4 — Americans (Abe Lincoln / E. Roosevelt)
  ['Washington','New York','Boston','Philadelphia','Atlanta','Chicago','San Francisco',
   'Buffalo','St. Louis','Detroit','New Orleans','Baltimore','Denver','Cincinnati','Dallas',
   'Los Angeles','Kansas City','San Diego','Richmond','Las Vegas','Phoenix','Seattle',
   'Albuquerque','Portland','Minneapolis'],

  // 5 — Greeks (Alexander / Hippolyta)
  ['Athens','Sparta','Thermopylae','Corinth','Delphi','Pharsalos','Knossos','Argos',
   'Mycenae','Herakleia','Ephesos','Thessalonica','Rhodes','Eretria','Troy','Marathon',
   'Halicarnassus','Pergamon','Miletos','Artemisium','Megara','Phocaea','Sicyon','Gortyn',
   'Mytilene','Tegea','Syracuse','Apollonia'],

  // 6 — Indians (Gandhi / Indira Gandhi)
  ['Delhi','Bombay','Madras','Bangalore','Calcutta','Lahore','Karachi','Kolhapur','Jaipur',
   'Hyderabad','Bengal','Chittagong','Punjab','Dacca','Indus','Ganges'],

  // 7 — Russians (Lenin / Catherine the Great)
  ['Moscow','St. Petersburg','Kiev','Minsk','Smolensk','Odessa','Sevastopol','Tblisi',
   'Sverdlovsk','Yakutsk','Vladivostok','Novgorod','Krasnoyarsk','Riga','Rostov',
   'Astrakhan','Kharkov','Grozny','Dnepropetrovsk','Maikop','Kursk','Kuibyshev',
   'Magnitogorsk','Uralsk','Kazan','Vologda','Murmansk','Vitebsk','Batum','Tiflis',
   'Bryansk','Tula','Kalinin','Yaroslavl','Krasnovodsk'],

  // 8 — Zulus (Shaka / Shakala)
  ['Zimbabwe','Ulundi','Bapedi','Hlobane','Isandhlwana','Intombe','Mpondo','Ngome',
   'Swazi','Tugela','Umtata','Umfolozi','Ibabanago','Isipezi','Amatikulu','Zunguin'],

  // 9 — French (Louis XIV / Joan of Arc)
  ['Paris','Orleans','Lyons','Rheims','Tours','Marseilles','Chartres','Avignon','Besancon',
   'Rouen','Grenoble','Dijon','Amiens','Cherbourg','Poitiers','Toulouse','Bayonne',
   'Strasbourg','Brest','Bordeaux'],

  // 10 — Aztecs (Montezuma / Nazca)
  ['Tenochtitlan','Teotihuacan','Tlatelolco','Texcoco','Tlaxcala','Calixtlahuaca',
   'Xochicalco','Tlacopan','Atzcapotzalco','Tzintzuntzen','Malinalco','Tula','Tamuin',
   'Teayo','Cempoala','Chalco','Tlalmanalco','Ixtapaluca','Huexotla','Tepexpan',
   'Tepetlaoxtoc','Chiconautla','Zitlaltepec','Coyotepec','Tequixquiac','Jilotzingo',
   'Tlapanaloya','Tultitlan','Ecatepec','Coatepec','Chalchihuites','Chiauhtia',
   'Chapultepec','Itzapalapa','Ayotzinco','Iztapam'],

  // 11 — Chinese (Mao Tse Tung / Wu Zhao)
  ['Beijing','Shanghai','Canton','Nanking','Tsingtao','Xinjian','Chengdu','Hangchow',
   'Tientsin','Tatung','Macao','Anyang','Shantung','Chinan','Kaifeng','Ningpo',
   'Paoting','Yangchow'],

  // 12 — English (Henry VIII / Elizabeth I)
  ['London','York','Nottingham','Hastings','Canterbury','Coventry','Warwick','Newcastle',
   'Oxford','Liverpool','Dover','Brighton','Norwich','Leeds','Reading','Birmingham',
   'Richmond','Exeter','Cambridge','Gloucester','Manchester','Bristol','Leicester',
   'Carlisle','Ipswich','Portsmouth','Berwick'],

  // 13 — Mongols (Genghis Khan / Bortei)
  ['Karakorum','Samarkand','Bokhara','Nishapur','Kashgar','Tabriz','Aleppo','Kabul',
   'Ormuz','Basra','Khanbalyk','Khorasan','Shangtu','Kazan','Quinsay','Kerman'],

  // 14 — Celts (Cunobelin / Boadicea)
  ['Cardiff','Kells','Carmarthen','Armagh','Caernarfon','Tintagel','Caerphilly','Cork',
   'Rhymney','Iona','Rhondda','Illauntanig','Swansea','Durrow','Merthyr','Tara',
   'Llangollen','Dinas Powys','Aberystwyth','Rhayader','Abergavenny','Dinas Emrys',
   'Cardigan','Llanelli','Maesteg','Neath'],

  // 15 — Japanese (Tokugawa / Amaterasu)
  ['Kyoto','Osaka','Edo','Satsuma','Kagoshima','Nara','Nagoya','Izumo','Nagasaki',
   'Yokohama','Shimonoseki','Matsuyama','Sapporo','Hakodate','Ise','Toyama','Fukushima',
   'Suo','Bizen','Echizen','Izumi','Omi','Echigo','Kozuke','Sado'],

  // 16 — Vikings (Canute / Gunnhild)
  ['Trondheim','Kaupang','Uppsala','Hladir','Aarhus','Viborg','Roskilde','The Udal',
   'Lindholm','Jorvik','Westness','Jarrow','Skara','Ravning Enge','Birka','Jarlshof',
   'Sigtuna','Odense','Lunde','Larne','Hedeby','Aldeigjuborg','Holmgard','Nonnebakken',
   'Ribblehead','Thwaite','Askrigg','Trelleborg','Risby','Jelling','Vorbasse','Fyrkat',
   'Kvivik'],

  // 17 — Spanish (Philip II / Isabella)
  ['Madrid','Seville','Toledo','Cordoba','Valencia','Salamanca','Barcelona','Valladolid',
   'Saragossa','Cadiz','Bilbao','Granada','Malaga','Pamplona','Vigo','Avila','Leon',
   'Burgos','Oviedo','Santander','Ciudad Rodrigo','Calatrava','Cartagena'],

  // 18 — Persians (Xerxes / Scheherezade)
  ['Persepolis','Pasargadae','Susa','Arbela','Antioch','Tarsus','Gordium','Bactra',
   'Sidon','Tyre','Sardis','Samaria','Hamadan','Ergili','Dariush Kabir','Ghulaman',
   'Zohak','Istakhr','Jinjan','Borazjan','Herat','Dakyanus','Bampur','Tureng Tepe',
   'Merv','Behistun','Kandahar','Altin Tepe','Bunyan','Charsadda','Ura Tyube'],

  // 19 — Carthaginians (Hannibal / Dido)
  ['Carthage','Utica','Malaca','Caralis','Panormus','Leptis Parva','Cartenna','Rusicade',
   'Gades','Rusucurru','Girba','Leptis Magna','Carthago Nova','Oea','Tingis','Rusaddit',
   'Alalia','Selinus','Himera','Akragas','Theveste','Saguntum'],

  // 20 — Sioux (Sitting Bull / Sacajawea)
  ['Little Bighorn','Wounded Knee','Cedar Creek','Slim Buttes','Three Forks','Stony Lake',
   'Killdeer','Bear Paw','Big Mound','Wood Lake','Dead Buffalo','Point of Rocks',
   'Raging Brook','Running Bear','Silver Moon','Wildcat Valley','Great River',
   'Seven Brothers','Snake Canyon','First Wind','Yellowtree',"Chief's Crag",'Morning Rock'],
];

/** Overflow city names shared across all civs when their own list is exhausted. */
export const EXTRA_CITIES = [
  'Naples','Issus','Cunaxa','Cremona','Cannae','Capua','Turin','Genoa','Crete','Verona',
  'Salamis','Lisbon','Hamburg','Prague','Salzburg','Bergen','Venice','Milan','Ghent',
  'Pisa','Dublin','Toronto','Melbourne','Sydney',
];


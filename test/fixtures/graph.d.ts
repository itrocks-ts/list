export declare class Country {
	name: string
}
export declare class City {
	children: City[]
	country: Country
	name: string
	parent: City
	postcode: string
}
export declare class Invoice {
	active: boolean
	cities: City[]
	city?: City
	cityOther?: City
	number: string
}

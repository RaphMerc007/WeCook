export interface Meal {
	id: string;
	name: string;
	imageUrl: string;
	category: string;
	price: string | number;
	hasSideDish: boolean;
	sideDishes: string[];
}

export interface WeekSelection {
	weekNumber: number;
	meals: Record<string, number>;
	date: Date;
}

export interface UserSelections {
	totalWeeks: number;
	currentWeek: number;
	selections: {
		weekNumber: number;
		meals: Record<string, number>;
		date?: Date;
	}[];
}

// New interface for client meal selections
export interface ClientMealSelection {
	clientId: string;
	date: Date;
	mealId: string;
	quantity: number;
	createdAt?: Date;
}

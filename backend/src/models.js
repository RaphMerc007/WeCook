export const SelectionsModel = mongoose.model(
	"Selections",
	new mongoose.Schema({
		totalWeeks: { type: Number, default: 1 },
		currentWeek: { type: Number, default: 0 },
		selections: [
			{
				weekNumber: Number,
				meals: { type: Map, of: Number },
				date: String,
				clientSelections: {
					type: Map,
					of: {
						clientId: String,
						clientName: String,
						selectedMeals: { type: Map, of: Number },
					},
				},
			},
		],
	})
);

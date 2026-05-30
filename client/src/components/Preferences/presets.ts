export const DIET_PRESETS = [
  { name: 'Vegetarian', label: 'Vegetarian' },
  { name: 'Vegan', label: 'Vegan' },
  { name: 'Keto', label: 'Keto' },
  { name: 'Paleo', label: 'Paleo' },
  { name: 'Halal', label: 'Halal' },
  { name: 'Kosher', label: 'Kosher' },
  { name: 'Gluten-Free', label: 'Gluten-Free' },
  { name: 'Dairy-Free', label: 'Dairy-Free' },
  { name: 'Pescatarian', label: 'Pescatarian' },
  { name: 'Low-Carb', label: 'Low-Carb' },
] as const;

export const ALLERGEN_PRESETS = [
  { name: 'Peanuts', label: 'Peanuts', color: 'danger' },
  { name: 'Tree Nuts', label: 'Tree Nuts', color: 'danger' },
  { name: 'Dairy', label: 'Dairy', color: 'warning' },
  { name: 'Eggs', label: 'Eggs', color: 'warning' },
  { name: 'Shellfish', label: 'Shellfish', color: 'danger' },
  { name: 'Fish', label: 'Fish', color: 'warning' },
  { name: 'Soy', label: 'Soy', color: 'warning' },
  { name: 'Wheat', label: 'Wheat', color: 'warning' },
  { name: 'Sesame', label: 'Sesame', color: 'warning' },
] as const;

export const KITCHEN_PRESETS = {
  appliances: [
    { name: 'Oven', label: 'Convection Oven' },
    { name: 'Air Fryer', label: 'Air Fryer' },
    { name: 'Microwave', label: 'Microwave' },
    { name: 'Slow Cooker', label: 'Slow Cooker' },
    { name: 'Instant Pot', label: 'Instant Pot' },
    { name: 'Food Processor', label: 'Food Processor' },
    { name: 'Blender', label: 'Blender' },
    { name: 'Sous Vide', label: 'Sous Vide' },
  ],
  cooktops: [
    { name: 'Gas Stove', label: 'Gas Stove' },
    { name: 'Induction Cooktop', label: 'Induction Cooktop' },
    { name: 'Electric Cooktop', label: 'Electric Cooktop' },
  ],
  tools: [
    { name: 'Chef Knife', label: 'Chef\'s Knife' },
    { name: 'Cast Iron Skillet', label: 'Cast Iron Skillet' },
    { name: 'Baking Sheet', label: 'Baking Sheet' },
    { name: 'Wok', label: 'Wok' },
    { name: 'Dutch Oven', label: 'Dutch Oven' },
  ],
} as const;

export const COOKING_LEVELS = [
  { level: 'Beginner', label: 'Beginner', desc: 'Simple, quick meals & basic techniques' },
  { level: 'Home Cook', label: 'Home Cook', desc: 'Comfortable with standard recipes & knife skills' },
  { level: 'Advanced', label: 'Advanced', desc: 'Enjoys multi-step processes & complex methods' },
  { level: 'Master Chef', label: 'Master Chef', desc: 'Professional-level craft & creative customization' },
] as const;

export const AUTOCOMPLETE_SUGGESTIONS: Record<string, string[]> = {
  Taste: [
    'Spicy-loving',
    'Cilantro Averse',
    'Sweet tooth',
    'Low sodium',
    'Garlic lover',
    'Citrus-loving',
    'Bitter-sensitive',
    'Umami-rich',
    'No mushrooms',
    'Extra hot',
  ],
  Goals: [
    'Meal prep',
    'Healthy eating',
    'Quick dinners',
    'Budget friendly',
    'High protein',
    'Low calorie',
    'Family friendly',
    'Learn baking',
    'Gourmet cooking',
    'One-pot meals',
  ],
  'Religious & Cultural Rules': [
    'Halal ingredients',
    'Kosher food',
    'No alcohol in cooking',
    'Buddhist vegetarian',
    'Hindu diet (No beef)',
    'Lenten fast compatible',
  ],
  'Personal Context': [
    'Cooks for one',
    'Busy weeknights',
    'Physical energy constraints',
    'Prefers fresh produce',
    'Student budget',
    'Oven-only recipes preferred',
  ],
};

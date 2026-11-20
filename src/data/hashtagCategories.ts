export const hashtagCategories = [
  'art', 'drawing', 'painting', 'illustration', 'design', 'diy', 'crafts', 'photography', 'film', 'animation',
  'music', 'singing', 'dance', 'instruments', 'production', 'concerts', 'podcasts', 'comedy', 'memes', 'entertainment',
  'gaming', 'esports', 'streaming', 'technology', 'coding', 'gadgets', 'ai', 'science', 'space', 'engineering',
  'education', 'learning', 'languages', 'books', 'writing', 'history', 'study', 'career', 'business', 'entrepreneurship',
  'fitness', 'gym', 'running', 'yoga', 'sports', 'football', 'basketball', 'cycling', 'outdoors', 'wellness',
  'mentalhealth', 'mindfulness', 'nutrition', 'cooking', 'recipes', 'baking', 'coffee', 'food', 'restaurants', 'vegan',
  'travel', 'adventure', 'hiking', 'camping', 'beach', 'cityguide', 'nature', 'wildlife', 'gardening', 'sustainability',
  'fashion', 'style', 'beauty', 'skincare', 'makeup', 'hair', 'streetwear', 'interiors', 'home', 'minimalism',
  'lifestyle', 'dailyvlog', 'family', 'friends', 'pets', 'dogs', 'cats', 'relationships', 'parenting', 'motivation',
  'productivity', 'personalfinance', 'investing', 'marketing', 'realestate', 'cars', 'motorcycles', 'volunteering', 'culture', 'community',
  'sculpture', 'ceramics', 'fashiondesign', 'graphicdesign', 'typography', 'calligraphy', 'woodworking', 'knitting', 'sewing', 'jewelry',
  'digitalart', 'watercolor', 'comics', 'cosplay', 'shortfilms', 'videography', 'podcasting', 'djing', 'songwriting', 'vinyl',
  'indiegames', 'boardgames', 'puzzles', 'mobilegames', 'retrogaming', 'virtualreality', 'robotics', 'cybersecurity', 'webdevelopment', 'datascience',
  'astronomy', 'biology', 'chemistry', 'physics', 'mathematics', 'environment', 'climateaction', 'recycling', 'zerowaste', 'renewableenergy',
  'meditation', 'pilates', 'strengthtraining', 'boxing', 'martialarts', 'swimming', 'tennis', 'skateboarding', 'surfing', 'skiing',
  'mealprep', 'vegetarian', 'streetfood', 'desserts', 'tea', 'nutritiontips', 'bicycles', 'vanlife', 'backpacking', 'architecture',
  'homedecor', 'interiordesign', 'thrifting', 'vintagefashion', 'mensfashion', 'nailart', 'fragrance', 'parentlife', 'relationshipsadvice', 'selfcare',
  'journaling', 'careeradvice', 'sidehustle', 'smallbusiness', 'entrepreneurlife', 'budgeting', 'savingmoney', 'cryptocurrency', 'realestateinvesting', 'leadership',
  'languagelearning', 'bookclub', 'poetry', 'fiction', 'travelphotography', 'roadtrip', 'nationalparks', 'birdwatching', 'plantcare', 'socialimpact',
  'homecooking', 'healthyliving', 'mobility', 'trackandfield', 'tabletopgames', 'gameart', 'sounddesign', 'makeupartist', 'future', 'localbusiness',
] as const;

export type HashtagCategory = (typeof hashtagCategories)[number];

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontFamily: {
  			display: ['Fraunces', 'Noto Serif Kannada', 'Noto Serif Telugu', 'Noto Serif Devanagari', 'Georgia', 'serif'],
  		},
  		colors: {
  			// AgriQNet palette: the old emerald/lime accents are remapped to forest green and harvest gold
  			emerald: { 50: '#EEF4EF', 100: '#DCE8DF', 200: '#B7D0BF', 300: '#9FC4AC', 400: '#6FA285', 500: '#3E7759', 600: '#2B6046', 700: '#1F4D3A', 800: '#183D2E', 900: '#112C21', 950: '#0B1F17' },
  			lime: { 50: '#FBF6E4', 100: '#F6EDCB', 200: '#EEDB98', 300: '#E2C766', 400: '#D6B443', 500: '#C9A227', 600: '#A8861C', 700: '#8A6D12', 800: '#6B540E', 900: '#4D3C0A', 950: '#2E2406' },
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};

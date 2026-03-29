new Vue({
    el: '#app',

    data: {
        searchQuery: '',
        locationName: 'London',
        weatherData: null,
        isLoading: false,
        error: null,
        unit: 'C',
        activeTab: 'today',
        suggestions: [],
        debounceTimeout: null,
        abortController: null
    },

    computed: {
        currentDayTime() {
            if (!this.weatherData) return '';
            const d = new Date();
            const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const hr = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            return `${days[d.getDay()]}, ${hr}:${min}`;
        }
    },

    methods: {
        onSearchInput() {
            clearTimeout(this.debounceTimeout);

            if (!this.searchQuery || this.searchQuery.trim() === '') {
                this.suggestions = [];
                return;
            }

            this.debounceTimeout = setTimeout(() => {
                this.fetchSuggestions(this.searchQuery);
            }, 150);
        },

        async fetchSuggestions(query) {
            if (this.abortController) {
                this.abortController.abort();
            }
            this.abortController = new AbortController();

            try {
                const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=5&language=en&format=json`, {
                    signal: this.abortController.signal
                });
                const data = await res.json();

                if (data.results) {
                    this.suggestions = data.results;
                } else {
                    this.suggestions = [];
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("Failed to fetch suggestions:", err);
                }
            }
        },

        hideDropdown() {
            setTimeout(() => {
                this.suggestions = [];
            }, 200);
        },

        selectCity(city) {
            this.searchQuery = `${city.name}, ${city.country}`;
            this.suggestions = [];
            this.searchWeather();
        },

        async searchWeather() {
            this.suggestions = [];

            if (!this.searchQuery) return;

            this.isLoading = true;
            this.error = null;

            try {
                const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${this.searchQuery}&count=1&language=en&format=json`);
                const geoData = await geoRes.json();

                if (!geoData.results || geoData.results.length === 0) {
                    this.error = "City not found. Please try another place.";
                    this.isLoading = false;
                    return;
                }

                const location = geoData.results[0];
                this.locationName = `${location.name}, ${location.country}`;

                const weatherURL = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true&hourly=relativehumidity_2m,visibility&daily=sunrise,sunset,uv_index_max,temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
                const weatherRes = await fetch(weatherURL);
                const rawWeather = await weatherRes.json();

                const aqiRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${location.latitude}&longitude=${location.longitude}&hourly=european_aqi`);
                const aqiData = await aqiRes.json();

                const hourlyIndex = rawWeather.hourly.time.findIndex(t => t === rawWeather.current_weather.time);
                const idx = hourlyIndex !== -1 ? hourlyIndex : 0;

                this.weatherData = {
                    current: rawWeather.current_weather,
                    daily: {
                        uvIndex: rawWeather.daily.uv_index_max[0] || 0,
                        sunrise: rawWeather.daily.sunrise[0].split("T")[1],
                        sunset: rawWeather.daily.sunset[0].split("T")[1]
                    },
                    weekly: rawWeather.daily.time.map((time, i) => ({
                        date: new Date(time).toLocaleDateString('en-US', { weekday: 'short' }),
                        maxTemp: rawWeather.daily.temperature_2m_max[i],
                        minTemp: rawWeather.daily.temperature_2m_min[i],
                        weathercode: rawWeather.daily.weathercode[i]
                    })),
                    hourly: {
                        humidity: rawWeather.hourly.relativehumidity_2m[idx],
                        visibility: (rawWeather.hourly.visibility[idx] / 1000).toFixed(1),
                        aqi: aqiData.hourly.european_aqi[idx] || 50
                    }
                };

                this.searchQuery = ''; 

            } catch (err) {
                console.error("Error fetching weather:", err);
                this.error = "Failed to fetch weather data. Please check your connection.";
            } finally {
                this.isLoading = false;
            }
        },

        setUnit(u) {
            this.unit = u;
        },

        setTab(tab) {
            this.activeTab = tab;
        },

        displayTemp(celsiusValue) {
            if (!celsiusValue) return 0;
            if (this.unit === 'F') {
                return Math.round((celsiusValue * 9 / 5) + 32);
            }
            return Math.round(celsiusValue);
        },

        getHumidityStatus(humidity) {
            if (humidity < 30) return 'Too Dry';
            if (humidity <= 60) return 'Normal';
            return 'Too Humid';
        },

        getVisibilityStatus(visibility) {
            if (visibility > 10) return 'Very Good';
            if (visibility > 5) return 'Average';
            return 'Poor';
        },

        getAqiStatus(aqi) {
            if (aqi < 50) return 'Good';
            if (aqi < 100) return 'Moderate';
            return 'Unhealthy';
        },

        getWeatherIcon(code) {
            if (code === 0) return 'https://cdn-icons-png.flaticon.com/512/3222/3222800.png';
            if (code > 0 && code <= 3) return 'https://cdn-icons-png.flaticon.com/512/1146/1146869.png';
            if (code >= 51 && code <= 67) return 'https://cdn-icons-png.flaticon.com/512/3313/3313888.png';
            return 'https://cdn-icons-png.flaticon.com/512/1146/1146869.png';
        }
    },

    mounted() {
        this.searchQuery = 'London';
        this.searchWeather();
    }
});

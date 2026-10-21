/**
 * Where the data comes from, set with `VITE_DEV_MODE` in `.env`:
 *   local (default)  the screens that have no backend yet show the built-in mock data (demo content, fake delays).
 *   prod             no mock data is shown anywhere. Screens that are not connected to the backend yet show a
 *                    "not connected" page instead; sign-in, the profile and User Management use the real platform API.
 */
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'prod' ? 'prod' : 'local'
export const MOCK_DATA = DEV_MODE === 'local'

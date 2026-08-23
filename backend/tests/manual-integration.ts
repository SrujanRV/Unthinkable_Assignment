import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

async function testAuthAndAdmin() {
  console.log('=== STARTING ENDPOINT INTEGRATION TESTS ===\n');

  try {
    const testEmail = `admin_test_${Date.now()}@test.com`;
    const testPassword = 'password123';

    // 1. Test Registration
    console.log(`[Test 1] Registering Admin User: ${testEmail}...`);
    const regRes = await axios.post(`${API_URL}/auth/register`, {
      email: testEmail,
      password: testPassword,
      role: 'ADMIN',
    });
    console.log('✔ Registration successful!');
    console.log('Received response:', regRes.data.message);
    const token = regRes.data.token;

    // Set auth header for subsequent requests
    const client = axios.create({
      baseURL: API_URL,
      headers: { Authorization: `Bearer ${token}` },
    });

    // 2. Test fetching profile (/api/auth/me)
    console.log('\n[Test 2] Fetching Profile of Logged In User...');
    const meRes = await client.get('/auth/me');
    console.log('✔ Profile fetched successfully!');
    console.log('Logged in as:', meRes.data.user.email, 'with role:', meRes.data.user.role);

    // 3. Test Venue Creation
    console.log('\n[Test 3] Creating a New Venue via Admin Endpoint...');
    const venueRes = await client.post('/admin/venues', {
      name: 'Mega Arena',
      location: 'Los Angeles, CA',
    });
    console.log('✔ Venue created successfully!');
    console.log('Venue:', venueRes.data.venue);
    const venueId = venueRes.data.venue.id;

    // 4. Test Fetching Venue List
    console.log('\n[Test 4] Listing All Venues...');
    const listRes = await client.get('/admin/venues');
    console.log('✔ Venues listed successfully!');
    console.log(`Found ${listRes.data.venues.length} venues in database.`);

    // 5. Test Saving Venue Seating Layout (Categories + Seats)
    console.log('\n[Test 5] Saving Custom Seating Layout (2 rows x 3 columns)...');
    const layoutRes = await client.post(`/admin/venues/${venueId}/layout`, {
      categories: [
        { name: 'VIP', priceMultiplier: 2.0 },
        { name: 'Standard', priceMultiplier: 1.0 },
      ],
      seats: [
        { row: 'A', number: 1, categoryName: 'VIP' },
        { row: 'A', number: 2, categoryName: 'VIP' },
        { row: 'A', number: 3, categoryName: 'VIP' },
        { row: 'B', number: 1, categoryName: 'Standard' },
        { row: 'B', number: 2, categoryName: 'Standard' },
        { row: 'B', number: 3, categoryName: 'Standard' },
      ],
    });
    console.log('✔ Seating layout saved successfully!');
    console.log('Response:', layoutRes.data.message);

    // 6. Test Fetching Venue Details (to check layout state)
    console.log('\n[Test 6] Fetching Venue Details to Verify Layout State...');
    const detailsRes = await client.get(`/admin/venues/${venueId}`);
    const venueDetails = detailsRes.data.venue;
    console.log('✔ Venue details fetched successfully!');
    console.log('Name:', venueDetails.name);
    console.log('Categories:', venueDetails.seatCategories.map((c: any) => `${c.name} (${Number(c.priceMultiplier)}x)`).join(', '));
    console.log('Physical Seat Count:', venueDetails.seats.length);
    
    // Validate correct seat category bindings
    const vipSeats = venueDetails.seats.filter((s: any) => s.categoryName === 'VIP');
    const standardSeats = venueDetails.seats.filter((s: any) => s.categoryName === 'Standard');
    console.log(`- VIP Seats count (Expected 3): ${vipSeats.length}`);
    console.log(`- Standard Seats count (Expected 3): ${standardSeats.length}`);

    if (vipSeats.length === 3 && standardSeats.length === 3) {
      console.log('\n🌟 ALL AUTH AND ADMIN INTEGRATION TESTS PASSED SUCCESSFULLY! 🌟');
    } else {
      console.log('\n❌ INTEGRATION TESTS FAILED: Layout counts did not match expectations.');
    }

  } catch (error: any) {
    console.error('\n❌ INTEGRATION TESTS FAILED WITH ERROR:');
    if (error.response) {
      console.error(`Status ${error.response.status}:`, error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

testAuthAndAdmin();

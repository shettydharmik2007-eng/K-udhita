# Kṣudhita – Food Redistribution & Organic Waste Management System

A full-stack sustainability web platform engineered to combat food waste, reduce urban hunger, and accelerate organic circular economy practices. Built for a college demonstration and aligned with United Nations Sustainable Development Goals:
- **SDG 2: Zero Hunger** – Connecting commercial kitchens and banquet halls with NGOs and communities to redistribute safe, edible surplus meals.
- **SDG 12: Responsible Consumption and Production** – Preventing organic material from entering municipal solid waste dumps.
- **SDG 13: Climate Action** – Diverting unconsumed food into certified composting and anaerobic biogas channels to abate fugitive methane emissions.

---

## 🚀 Tech Stack
- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Modern Vanilla CSS Design System (Custom properties, Glassmorphism, Micro-interactions, Mobile Responsive)
- **Icons**: Lucide React
- **Backend / Cloud Services**:
  - **Firebase Authentication** – Role-based access control (Hotel/Banquet Donor, Requester/NGO, Waste Collection Partner)
  - **Cloud Firestore** – Real-time NoSQL database with ACID transactions and server timestamps
  - **Firebase Storage** – Cloud media bucket for smartphone camera capture and gallery uploads

---

## 🌟 Core Features

### 1. Hotel & Banquet Hall Dashboard
- Secure authentication for hotels, banquet halls, restaurants, and caterers.
- **Live camera capture** or gallery upload of surplus dishes.
- Input fields: Food Name, Category (Cooked Meals, Bakery, Raw Produce, etc.), Quantity in kg, Portions count, Preparation Time, Pickup Deadline, Location, Dietary tags, and Notes.
- Safe CRUD operations (edit listings, mark unavailable, delete).
- **One-Click Leftover Waste Transfer**: Food exceeding the pickup window can be safely routed to certified waste partners for composting or biogas.

### 2. Public Food Listings
- Real-time marketplace showcasing surplus food with actual uploaded photos.
- Filtering by category, dietary preference (Veg / Non-Veg / Vegan), and location search.
- Interactive pickup deadline countdowns.
- Quantity-validated request modal: prevents over-requesting using client and Firestore transaction locks.
- Real-time status tracking for both donors and requesters.

### 3. Leftover Waste Management (Circular Economy Loop)
- Unconsumed food or kitchen preparation trimmings are logged for municipal/private organic recycling.
- Categorization into:
  - **Suitable for Composting** (aerobic nutrient cycling into soil enrichment)
  - **Suitable for Biogas Processing** (anaerobic digestion for clean biofuel)
  - **Other Certified Disposal**
- Waste collection partners claim batches and advance through statuses: `Pending` → `Accepted` → `Collected` → `Completed`.
- **Honest Academic Disclaimer**: The system explicitly tracks the transfer and diversion logistics; it does not claim finished compost or gas has already been generated.

### 4. Live Impact Dashboard
- Computes real metrics directly from Firestore records:
  - Total Food Listed (kg & portions)
  - Food Successfully Redistributed (kg)
  - Food Currently Remaining Available (kg)
  - Organic Waste Diverted for Composting (kg)
  - Organic Waste Diverted for Biogas (kg)
  - Estimated Metric Tons of CO₂e Prevented (Landfill methane avoidance factor: ~2.5 kg CO₂e per kg food diverted)
- Interactive visual charts and SDG progress breakdowns.

---

## 🛠️ Step-by-Step Firebase Console Setup

To connect your live Firebase project, follow these simple steps:

### Step 1: Create a Project
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and name it (e.g., `foodshare-project`).
3. Google Analytics can be enabled or skipped. Click **Create project**.

### Step 2: Register Web App
1. In the project overview, click the **Web icon (`</>`)** to add a web application.
2. Enter an app nickname (e.g. `FoodShare Web`).
3. Copy the `firebaseConfig` object keys (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).

### Step 3: Enable Authentication
1. In the left sidebar, navigate to **Build** → **Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab, choose **Email/Password**.
4. Enable the first toggle (**Email/Password**) and click **Save**.

### Step 4: Enable Cloud Firestore
1. In the left sidebar, navigate to **Build** → **Firestore Database**.
2. Click **Create database**.
3. Choose a region closest to your users (e.g. `asia-south1` or `us-central1`).
4. Select **Start in test mode** for initial testing (or apply the production rules in `firestore.rules`).
5. Click **Create**.

### Step 5: Enable Firebase Storage
1. In the left sidebar, navigate to **Build** → **Storage**.
2. Click **Get Started**.
3. Select **Start in test mode** (or apply the rules from `storage.rules`).
4. Keep the default Cloud Storage bucket and click **Done**.

### Step 6: Configure Environment Variables
1. Open the `.env` file in the project root.
2. Fill in your Firebase keys:
```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=foodshare-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=foodshare-project
VITE_FIREBASE_STORAGE_BUCKET=foodshare-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:...
```

---

## 💻 Running the Website Locally

### Prerequisites
- Node.js (v18 or newer)
- npm (v9 or newer)

### Installation
Dependencies are already installed. If running on a fresh clone:
```bash
npm install
```

### Start Local Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

### Production Build & Verification
```bash
npm run build
```
```bash
npm run preview
```

---

## 📁 Firestore Database Structure

- `users`
  - `uid` (string): Firebase Auth User ID
  - `name` (string): Contact person name
  - `email` (string): User email
  - `role` (string): `'donor'` | `'requester'` | `'waste_partner'` | `'admin'`
  - `organizationName` (string): Hotel, NGO, or Recycler facility name
  - `phone` (string): Phone number
  - `address` (string): Physical address / city
  - `createdAt` (timestamp): Registration date

- `foodListings`
  - `id` (string): Document ID
  - `donorId` (string): User ID of the listing owner
  - `donorName` (string): Contact name
  - `donorOrg` (string): Hotel or Banquet Hall name
  - `foodName` (string): Dish name
  - `category` (string): Food category (`cooked_meals`, `bakery`, `raw_produce`, etc.)
  - `dietaryType` (string): `'veg'` | `'non-veg'` | `'vegan'`
  - `initialQuantityKg` (number): Starting weight in kg
  - `remainingQuantityKg` (number): Available weight in kg
  - `portions` (number): Portions / serving count
  - `prepTime` (string): Date and time food was prepared
  - `pickupDeadline` (string): Date and time by which food must be picked up
  - `location` (string): Pickup address and landmark
  - `storageCondition` (string): `'refrigerated'` | `'hot_holding'` | `'room_temp'`
  - `description` (string): Detailed notes, ingredients, packaging
  - `imageUrl` (string): Firebase Storage download URL
  - `status` (string): `'available'` | `'reserved'` | `'completed'` | `'expired'` | `'transferred_to_waste'`
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)

- `foodRequests`
  - `id` (string): Document ID
  - `listingId` (string): Target food listing ID
  - `foodName` (string): Dish name
  - `donorId` (string): Food owner UID
  - `donorOrg` (string): Hotel / Hall name
  - `requesterId` (string): Requester UID
  - `requesterName` (string): Requester contact name
  - `requesterOrg` (string): NGO or organization name
  - `requestedQuantityKg` (number): Requested weight
  - `requestedPortions` (number): Requested servings
  - `pickupTimeEstimate` (string): Expected arrival time
  - `notes` (string): Special remarks
  - `status` (string): `'pending'` | `'accepted'` | `'completed'` | `'rejected'` | `'cancelled'`
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)

- `wasteCollections`
  - `id` (string): Document ID
  - `sourceListingId` (string, optional): Associated expired listing ID if transferred
  - `donorId` (string): Creator UID
  - `donorOrg` (string): Hotel or business name
  - `foodName` (string): Description of organic waste
  - `category` (string): `'composting'` | `'biogas'` | `'other_disposal'`
  - `quantityKg` (number): Weight in kg
  - `location` (string): Collection pickup location
  - `destinationFacility` (string): Name of composting yard or biogas plant
  - `partnerId` (string, optional): Assigned waste collector UID
  - `partnerName` (string, optional): Assigned collector name
  - `status` (string): `'pending'` | `'accepted'` | `'collected'` | `'completed'`
  - `notes` (string): Contamination guidelines, packaging type
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)

---

## 🔒 Security Best Practices
- **Security Rules**: Included in `firestore.rules` and `storage.rules`. Deployed automatically via Firebase CLI (`firebase deploy --only firestore:rules,storage:rules`).
- **Atomic Transactions**: Food requests adjust remaining quantities using atomic Firestore transaction guarantees to eliminate double-booking or over-claiming.
- **Role Scoping**: Only listing owners can edit or transfer listings; only waste partners can claim waste collection dispatches.

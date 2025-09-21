# TimE BlockS Starter

This is a bare-bones starter web app using only HTML, CSS, and vanilla JavaScript. Open `index.html` in a browser to see the landing view and begin iterating on features.

## Structure

- `index.html` – basic document shell that wires the style sheet and script.
- `styles.css` – a minimal design system with a responsive layout and dark-mode support.
- `app.js` – placeholder logic that renders an empty state card and demonstrates DOM events.

## Next Steps

1. Replace the empty state with real components for your time-blocking workflow.
2. Add state management or connect to backend services as needed.
3. Consider integrating a build tool (Vite, Next.js, etc.) once requirements solidify.

Feel free to extend this starter however you like.


## Firebase (Compat) Setup

This app uses Firebase Auth (email/password) and Firestore for optional cloud save/load. Scripts are loaded via CDN using the compat SDK.

### 1) Configure Firebase
- Open `index.html` and update `firebaseConfig` with your project keys.
- Ensure these scripts are present before `app.js`:
	- `firebase-app-compat.js`
	- `firebase-auth-compat.js`
	- `firebase-firestore-compat.js`
	- (optional) `firebase-analytics-compat.js`

### 2) Security Rules
Rules file: `firestore.rules`

```
rules_version = '2';
service cloud.firestore {
	match /databases/{database}/documents {
		match /users/{userId}/planners/{plannerId} {
			allow read, write: if request.auth != null && request.auth.uid == userId;
		}
	}
}
```

Deploy with Firebase CLI:

```bash
firebase login
firebase init firestore   # select this project, choose to use existing rules file
firebase deploy --only firestore:rules
```

### 3) Using Cloud Save/Load
- Sign up or log in via the form at the bottom of the page.
- Use “Save to Cloud” / “Load from Cloud” buttons to manually sync.
- The app also auto-syncs to cloud shortly after each local save when signed in.

Data path: `users/{uid}/planners/default`

### 4) Local Development
Open `index.html` in a browser (or serve over localhost). No build step required.

# Baby Tracker App

## Overview
The Baby Tracker App is a web application designed to help parents manage and track the development of their child. Built with React and following Google's Material Design 3, this application provides a user-friendly interface optimized for smartphone users.

## Features
- **Child Information Tab**: Allows parents to input and view essential information about their child, including name, date of birth, gender, weight at birth, height at birth, and a profile picture.
- **Activities Tab**: Enables parents to log daily activities such as feeding, diaper changes, sleeping, bathing, and measurements. It also provides a summary of activities and AI-generated suggestions for future activities.
- **Statistics Tab**: Offers visual representations of the child's activities over time, including feeding frequency, diaper changes, sleep duration, weight, and height.

## Technologies Used
- **Frontend**: React, Material Design 3
- **Backend**: Firebase (Firestore for database)
- **Authentication**: Firebase Authentication

## Setup Instructions
1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd baby-tracker-app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Firebase**:
   - Replace the Firebase configuration in `src/firebase/config.ts` with your own Firebase project details.

4. **Run the application**:
   ```bash
   npm start
   ```

5. **Access the application**:
   Open your browser and navigate to `http://localhost:3000`.

## Folder Structure
- `public/`: Contains the main HTML file and static assets.
- `src/`: Contains all the source code for the application.
  - `components/`: Reusable components for the application.
  - `contexts/`: Context providers for managing global state.
  - `firebase/`: Firebase configuration and service functions.
  - `hooks/`: Custom hooks for managing state and side effects.
  - `pages/`: Main pages of the application.
  - `routes/`: Routing configuration.
  - `services/`: Services for AI analysis and suggestions.
  - `styles/`: Theme and styling configurations.
  - `types/`: TypeScript types and interfaces.
  - `utils/`: Utility functions for various purposes.

## Contributing
Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.
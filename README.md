# S3Hub

![S3Hub Logo](https://github.com/berrujaime/S3Hub/blob/dev/S3Hub/assets/logos/S3HubLogo.png)

## Overview

**S3Hub** is a React Native application built using Expo for managing S3 buckets. The app allows users to connect to both **Storj** and **AWS S3** buckets for managing files. It provides a user-friendly interface to view, upload, delete, and organize your videos, images, and folders.

### Features
- **Multiple cloud support**: Connect and manage files from both **Storj** and **AWS S3** services.
- **File management**: View images and videos, upload new files, delete files, and create folders.
- **Multi-lingual**: Available in both English and Spanish.
- **File preview and playback**: Cached images and videos for faster preview.
- **Connection management**: Easily switch between different S3 connections.

## APK Download

You can download the APK for the app using the link or QR code below:

[**Download S3Hub APK**](https://expo.dev/accounts/berrujaime/projects/S3Hub/builds/907f0dfb-eb39-4617-9215-5a7276893888)

![Download QR Code](https://github.com/berrujaime/S3Hub/blob/dev/S3Hub/assets/apk/apkQR.png)

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/berrujaime/S3Hub.git
   cd S3Hub
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the project in development mode using Expo:
   ```bash
   npx expo start
   ```

## Key Functionalities

### Login and Connections
- **ConnectionSelectScreen**: Users can manage connections to Storj and AWS by providing credentials like Access Key and Secret Key. The region can be selected based on the service provider.
- **LoginScreen**: Validates credentials for both AWS S3 and Storj, allowing users to add a new connection. Users can choose between AWS or Storj and their respective regions.

### Bucket and File Management
- **BucketSelectScreen**: After a successful connection, users can browse the available buckets for that connection. The app automatically navigates to the file list if only one bucket is available.
- **FileListScreen**: Allows users to view, upload, download, delete, and share files. The screen supports both grid and list views, allowing users to easily manage large collections of files and media. 

### Upload and Progress Tracking
- **UploadProgressPopup**: Displays progress for file uploads and deletions with real-time progress updates.

### Settings
- **SettingsScreen**: Allows users to select their preferred language (English or Spanish).

## How to Browse the Repository

The repository is structured in a typical React Native format with the following important directories and files:

- **App.js**: The entry point of the application that sets up the navigation and theme.
- **/src**: Contains all the source code.
  - **/screens**: Holds the key screens for the app such as `LoginScreen`, `ConnectionSelectScreen`, `BucketSelectScreen`, `FileListScreen`, and `SettingsScreen`.
  - **/components**: Includes reusable components like `UploadProgressPopup`.
  - **/context**: Contains the `AuthContext` that manages the state for connections, buckets, and language settings.
  - **/locales**: Stores the translation files for multiple languages.
  - **/services**: Contains services for handling S3 connections and file operations.
  
To make any changes to the app, you will primarily be working in the `/src` directory.

## License

This project is licensed under the **GPLv3 License**. See the [LICENSE](LICENSE) file for details.

## Contributions

Contributions are welcome! Feel free to fork this repository, submit pull requests, or report issues. 

Contact: **Jaime Berruete** at berrujaime@gmail.com

---

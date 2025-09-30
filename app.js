// This script provides a minimal integration with Firebase for authentication,
// Cloud Firestore, and Cloud Storage. It is only meant as a starting point
// for your RecStu app. You must replace the firebaseConfig values below with
// your own project's configuration (found in the Firebase console). See
// https://firebase.google.com/docs/web/setup for instructions.

// TODO: Replace with your project's config object. API keys for Firebase
// services are *not secret* and can safely be embedded in frontend code【591711264377620†L292-L300】.
const firebaseConfig = {
  // Firebase configuration for the recstu‑4‑u project.  See the Firebase
  // console's “SDK setup and configuration” section for these values.  The
  // apiKey is not a secret, but it identifies your project and must
  // exactly match the value in your Firebase settings.
  apiKey: "AIzaSyBxjd8D6LmNcxiHWU2U6aXGdcjAYeY83wk",
  authDomain: "recstu-4-u.firebaseapp.com",
  projectId: "recstu-4-u",
  // Note: Firebase Storage uses the `.app` domain, not `appspot.com`,
  // for the newer multi-region buckets.
  storageBucket: "recstu-4-u.firebasestorage.app",
  messagingSenderId: "472949926583",
  appId: "1:472949926583:web:a1146983b3063d4f9a3b32",
  // Optional: include measurementId if you plan to use Google Analytics.
  measurementId: "G-QGN40VVG6J",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// DOM elements
const authSection = document.getElementById('authSection');
const appSection = document.getElementById('appSection');
const signInBtn = document.getElementById('signInBtn');
const signUpBtn = document.getElementById('signUpBtn');
const logoutBtn = document.getElementById('logoutBtn');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const authError = document.getElementById('authError');
const clientsList = document.getElementById('clientsList');
const currentClientName = document.getElementById('currentClientName');
const messagesContainer = document.getElementById('messagesContainer');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const postForm = document.getElementById('postForm');
const postText = document.getElementById('postText');
const postAttachment = document.getElementById('postAttachment');
const feedPosts = document.getElementById('feedPosts');

let currentUser = null;
let currentClientUid = null;
let unsubscribePosts = null;
let unsubscribeMessages = null;

// Utility function to render a post in the feed
function renderPost(doc) {
  const data = doc.data();
  const postEl = document.createElement('div');
  postEl.classList.add('post');
  const meta = document.createElement('div');
  meta.classList.add('meta');
  meta.textContent = `${data.authorEmail} • ${data.createdAt.toDate().toLocaleString()}`;
  const content = document.createElement('div');
  content.textContent = data.text;
  postEl.appendChild(meta);
  postEl.appendChild(content);
  if (data.attachmentUrl) {
    // Show image or audio depending on file type
    if (data.attachmentUrl.match(/\.(jpeg|jpg|gif|png)$/i)) {
      const img = document.createElement('img');
      img.src = data.attachmentUrl;
      img.style.maxWidth = '100%';
      postEl.appendChild(img);
    } else {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = data.attachmentUrl;
      postEl.appendChild(audio);
    }
  }
  feedPosts.prepend(postEl);
}

// Utility function to render a single message
function renderMessage(doc) {
  const data = doc.data();
  const messageEl = document.createElement('div');
  messageEl.classList.add('message');
  // Apply class based on sender
  if (data.senderUid === currentUser.uid) {
    messageEl.classList.add('self');
  } else {
    messageEl.classList.add('other');
  }
  messageEl.textContent = data.text;
  messagesContainer.appendChild(messageEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Listen for authentication state changes
auth.onAuthStateChanged((user) => {
  currentUser = user;
  if (user) {
    authSection.hidden = true;
    appSection.hidden = false;
    logoutBtn.hidden = false;
    loadClients();
    subscribeToPosts();
  } else {
    // Clear UI
    authSection.hidden = false;
    appSection.hidden = true;
    logoutBtn.hidden = true;
    feedPosts.innerHTML = '';
    clientsList.innerHTML = '';
    messagesContainer.innerHTML = '';
    currentClientName.textContent = '';
    // Unsubscribe from any listeners
    if (unsubscribePosts) unsubscribePosts();
    if (unsubscribeMessages) unsubscribeMessages();
  }
});

// Sign in existing user
signInBtn.addEventListener('click', async () => {
  authError.textContent = '';
  try {
    await auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value);
  } catch (error) {
    authError.textContent = error.message;
  }
});

// Sign up new user
signUpBtn.addEventListener('click', async () => {
  authError.textContent = '';
  try {
    await auth.createUserWithEmailAndPassword(emailInput.value, passwordInput.value);
    // Save user profile to Firestore with a default role (client)
    await db.collection('users').doc(auth.currentUser.uid).set({
      email: emailInput.value,
      role: 'client', // you can change this manually in Firestore for the app owner
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    authError.textContent = error.message;
  }
});

// Sign out
logoutBtn.addEventListener('click', async () => {
  await auth.signOut();
});

// Load list of clients (users with role 'client')
async function loadClients() {
  clientsList.innerHTML = '';
  const snapshot = await db.collection('users').where('role', '==', 'client').get();
  snapshot.forEach((doc) => {
    const li = document.createElement('li');
    li.textContent = doc.data().email;
    li.addEventListener('click', () => {
      currentClientUid = doc.id;
      currentClientName.textContent = doc.data().email;
      messagesContainer.innerHTML = '';
      if (unsubscribeMessages) unsubscribeMessages();
      subscribeToMessages(currentClientUid);
    });
    clientsList.appendChild(li);
  });
}

// Subscribe to public feed posts
function subscribeToPosts() {
  // Query posts ordered by timestamp descending
  unsubscribePosts = db.collection('posts').orderBy('createdAt', 'desc').limit(50).onSnapshot((snapshot) => {
    feedPosts.innerHTML = '';
    snapshot.forEach((doc) => {
      renderPost(doc);
    });
  });
}

// Create a new public post
postForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return;
  const text = postText.value.trim();
  const file = postAttachment.files[0];
  let attachmentUrl = null;
  try {
    // Upload attachment to Cloud Storage if a file is selected
    if (file) {
      const storageRef = storage.ref().child(`posts/${currentUser.uid}/${Date.now()}_${file.name}`);
      const snapshot = await storageRef.put(file);
      attachmentUrl = await snapshot.ref.getDownloadURL();
    }
    await db.collection('posts').add({
      authorUid: currentUser.uid,
      authorEmail: currentUser.email,
      text,
      attachmentUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    postText.value = '';
    postAttachment.value = '';
  } catch (error) {
    console.error(error);
  }
});

// Subscribe to private messages with a given client
function subscribeToMessages(clientUid) {
  // Use a deterministic document path for conversation between currentUser and client
  const conversationId = currentUser.uid < clientUid ? `${currentUser.uid}_${clientUid}` : `${clientUid}_${currentUser.uid}`;
  unsubscribeMessages = db.collection('conversations').doc(conversationId).collection('messages').orderBy('createdAt', 'asc').onSnapshot((snapshot) => {
    messagesContainer.innerHTML = '';
    snapshot.forEach((doc) => {
      renderMessage(doc);
    });
  });
}

// Send a private message
messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser || !currentClientUid) return;
  const text = messageInput.value.trim();
  if (!text) return;
  // Determine conversation ID
  const conversationId = currentUser.uid < currentClientUid ? `${currentUser.uid}_${currentClientUid}` : `${currentClientUid}_${currentUser.uid}`;
  try {
    await db.collection('conversations').doc(conversationId).collection('messages').add({
      senderUid: currentUser.uid,
      receiverUid: currentClientUid,
      text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    messageInput.value = '';
  } catch (error) {
    console.error(error);
  }
});

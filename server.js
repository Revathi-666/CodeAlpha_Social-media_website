const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const fs = require('fs');
const path = require('path');  // Add this for serving static files
const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));  // Serve all files from root directory

// Ensure 'uploads/' directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Configure multer storage options
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// Initialize SQLite database
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Failed to connect to SQLite database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        // Create the "users" table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
        )`);
        // Create the "profiles" table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS profiles (
            user_id INTEGER PRIMARY KEY,
            bio TEXT,
            profile_pic TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        // Create the "messages" table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES users(id),
            FOREIGN KEY (receiver_id) REFERENCES users(id)
        )`);

        // Create the "posts" table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            postContent TEXT,
            imagePath TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
    }
});

// Serve signup page when visiting root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));  
});

// Signup route
app.post('/signup', (req, res) => {
    const { username, email, password } = req.body;

    console.log(`Username: ${username}, Email: ${email}, Password: ${password}`);

    // Check if email already exists in the database
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (row) {
            return res.status(400).json({ success: false, message: 'Email already exists.' });
        }

        // Insert new user into the database
        const query = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
        db.run(query, [username, email, password], function (err) {
            if (err) {
                console.error(err.message);
                return res.status(500).json({ success: false, message: 'Server error, please try again later.' });
            }

            console.log(`User with email: ${email} created successfully.`);
            return res.json({ success: true, message: 'Sign-up successful!' });
        });
    });
});

// Login route
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Check if user exists in the database
    db.get('SELECT id, username, email FROM users WHERE email = ? AND password = ?', [email, password], (err, row) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).json({ success: false, message: 'Server error, please try again later.' });
        }

        if (row) {
            // Send user data (excluding password) back to client
            return res.json({
                success: true,
                message: 'Login successful!',
                user: {
                    id: row.id,
                    username: row.username,
                    email: row.email
                }
            });
        } else {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
    });
});

// Post route (uploading a file)
app.post('/create-post', upload.single('image'), (req, res) => {
    const { postContent, user_id } = req.body;

    console.log('Received post content:', postContent);
    console.log('Received user_id:', user_id);
    console.log('Received file:', req.file);

    if (!postContent || !user_id) {
        return res.status(400).json({ success: false, message: 'Post content and user ID are required.' });
    }

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image uploaded.' });
    }

    const imagePath = req.file.path;

    const query = 'INSERT INTO posts (user_id, postContent, imagePath) VALUES (?, ?, ?)';
    db.run(query, [user_id, postContent, imagePath], function (err) {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
        return res.json({
            success: true,
            message: 'Post created successfully!',
            data: { postContent, imagePath }
        });
    });
});

// Route to fetch all posts (home page)
app.get('/get-posts', (req, res) => {
    const query = 'SELECT * FROM posts ORDER BY created_at DESC';
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ success: false, message: 'Server error' });
        }

        // Modify the image path to match the static folder structure
        const posts = rows.map(post => ({
            ...post,
            imagePath: `http://localhost:3000/${post.imagePath}`
        }));

        res.json({ success: true, posts: posts });
    });
});

// Route to fetch posts for a specific user (profile page)
app.get('/get-profile-posts/:user_id', (req, res) => {
    const userId = req.params.user_id;
    const query = 'SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC';
    db.all(query, [userId], (err, rows) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ success: false, message: 'Server error' });
        }

        // Modify the image path to match the static folder structure
        const posts = rows.map(post => ({
            ...post,
            imagePath: `http://localhost:3000/${post.imagePath}`
        }));

        res.json({ success: true, posts: posts });
    });
});

// Route to get user profile
app.get('/get-profile/:user_id', (req, res) => {
    const userId = req.params.user_id;
    const query = `
        SELECT users.username, users.email, profiles.bio, profiles.profile_pic 
        FROM users 
        LEFT JOIN profiles ON users.id = profiles.user_id 
        WHERE users.id = ?`;
    
    db.get(query, [userId], (err, row) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
        if (!row) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, profile: row });
    });
});

// Route to update user profile
app.post('/update-profile/:user_id', upload.single('profile_pic'), (req, res) => {
    const userId = req.params.user_id;
    const { bio } = req.body;
    let profile_pic = null;

    console.log('Received update request:', { userId, bio, file: req.file });  // Debug log

    if (req.file) {
        profile_pic = req.file.path;
    }

    // First, check if profile exists
    db.get('SELECT * FROM profiles WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).json({ success: false, message: 'Server error' });
        }

        if (row) {
            // Update existing profile
            const query = 'UPDATE profiles SET bio = ?, profile_pic = COALESCE(?, profile_pic) WHERE user_id = ?';
            db.run(query, [bio, profile_pic, userId], (err) => {
                if (err) {
                    console.error('Update error:', err.message);
                    return res.status(500).json({ success: false, message: 'Server error' });
                }
                return res.json({ 
                    success: true, 
                    message: 'Profile updated successfully',
                    profile: {
                        bio,
                        profile_pic: profile_pic || row.profile_pic
                    }
                });
            });
        } else {
            // Create new profile
            const query = 'INSERT INTO profiles (user_id, bio, profile_pic) VALUES (?, ?, ?)';
            db.run(query, [userId, bio, profile_pic], (err) => {
                if (err) {
                    console.error('Insert error:', err.message);
                    return res.status(500).json({ success: false, message: 'Server error' });
                }
                return res.json({ 
                    success: true, 
                    message: 'Profile created successfully',
                    profile: {
                        bio,
                        profile_pic
                    }
                });
            });
        }
    });
});

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Route to send a message
app.post('/send-message', (req, res) => {
    const { sender_id, receiver_id, content } = req.body;

    if (!sender_id || !receiver_id || !content) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const query = 'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)';
    db.run(query, [sender_id, receiver_id, content], function(err) {
        if (err) {
            console.error('Error sending message:', err.message);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
        return res.json({ 
            success: true, 
            message: 'Message sent successfully',
            messageId: this.lastID
        });
    });
});

// Route to get messages between two users
app.get('/get-messages/:user1_id/:user2_id', (req, res) => {
    const { user1_id, user2_id } = req.params;
    
    const query = `
        SELECT m.*, 
               u1.username as sender_name,
               u2.username as receiver_name
        FROM messages m
        JOIN users u1 ON m.sender_id = u1.id
        JOIN users u2 ON m.receiver_id = u2.id
        WHERE (m.sender_id = ? AND m.receiver_id = ?) 
           OR (m.sender_id = ? AND m.receiver_id = ?)
        ORDER BY m.created_at ASC`;

    db.all(query, [user1_id, user2_id, user2_id, user1_id], (err, rows) => {
        if (err) {
            console.error('Error fetching messages:', err.message);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
        return res.json({ success: true, messages: rows });
    });
});

// Route to get all users
app.get('/users', (req, res) => {
    const query = `
        SELECT users.id, users.username, profiles.profile_pic
        FROM users
        LEFT JOIN profiles ON users.id = profiles.user_id
        ORDER BY users.username`;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching users:', err.message);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
        return res.json({ success: true, users: rows });
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

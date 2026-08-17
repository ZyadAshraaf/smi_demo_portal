FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first (for layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the source code
COPY . .

# Expose your app's port (change if needed)
EXPOSE 4046

# Start the app
CMD ["npm", "start"]
 
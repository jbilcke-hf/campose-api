FROM nvidia/cuda:12.2.0-devel-ubuntu22.04
    
LABEL maintainer="Hugging Face"

ARG COLMAP_GIT_COMMIT=main
ARG CUDA_ARCHITECTURES=native
ENV QT_XCB_GL_INTEGRATION=xcb_egl

# Prevent stop building ubuntu at time zone selection.  
ENV DEBIAN_FRONTEND=noninteractive

RUN echo "Build started at: $(date "+%Y-%m-%d %H:%M")"

RUN apt-get update

RUN apt-get install -y \
  wget \
  curl \
  git \
  git-lfs \
  unzip

RUN git lfs install

# Prepare and empty machine for building.
RUN apt-get install -y \
    cmake \
    ninja-build \
    build-essential \
    libboost-program-options-dev \
    libboost-filesystem-dev \
    libboost-graph-dev \
    libboost-system-dev \
    libeigen3-dev \
    libflann-dev \
    libfreeimage-dev \
    libmetis-dev \
    libgoogle-glog-dev \
    libgtest-dev \
    libsqlite3-dev \
    libglew-dev \
    qtbase5-dev \
    libqt5opengl5-dev \
    libcgal-dev \
    libceres-dev

# Build and install COLMAP.
RUN git clone https://github.com/colmap/colmap.git
RUN cd colmap && \
    git fetch https://github.com/colmap/colmap.git ${COLMAP_GIT_COMMIT} && \
    git checkout FETCH_HEAD && \
    mkdir build && \
    cd build && \
    cmake .. -GNinja -DCMAKE_CUDA_ARCHITECTURES=${CUDA_ARCHITECTURES} && \
    ninja && \
    ninja install && \
    cd .. && rm -rf colmap

# NodeJS - NEW, MORE ANNOYING WAY
RUN apt --yes install -y ca-certificates gnupg
RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
ENV NODE_MAJOR=18
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN apt update
RUN apt --yes install nodejs

# Python
RUN apt --yes install python3 python3-pip
RUN python3 -m pip install --no-cache-dir --upgrade pip

# Set up a new user named "user" with user ID 1000
RUN useradd -o -u 1000 user

# Switch to the "user" user
USER user

ENV PYTHON_BIN /usr/bin/python3

#ENV PATH /usr/local/cuda-12.2/bin:$PATH
#ENV LD_LIBRARY_PATH /usr/local/cuda-12.2/lib64:$LD_LIBRARY_PATH
# Let's try to downgrade
ENV PATH /usr/local/cuda-11.8/bin:$PATH
ENV LD_LIBRARY_PATH /usr/local/cuda-11.8/lib64:$LD_LIBRARY_PATH


# Set home to the user's home directory
ENV HOME=/home/user \
	PATH=/home/user/.local/bin:$PATH

# Set the working directory to the user's home directory
WORKDIR $HOME/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY --chown=user package*.json $HOME/app

RUN npm install

# Copy the current directory contents into the container at $HOME/app setting the owner to the user
COPY --chown=user . $HOME/app

RUN echo "Build ended at: $(date "+%Y-%m-%d %H:%M")"

EXPOSE 7860

# we can't use this (it time out)
# CMD [ "xvfb-run", "-s", "-ac -screen 0 1920x1080x24", "npm", "run", "start" ]
CMD [ "npm", "run", "start" ]

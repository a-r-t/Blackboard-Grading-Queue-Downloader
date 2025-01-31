# Blackboard Grading Queue Downloader

## What is this?

After so many years of spending so much time individually downloading/unzipping student submission files from Blackboard using its ancient UI, I decided to automate the process.
This is a script that will download all files from all student submissions for all assignments from a specific course on Blackboard to your computer in an organized manner.
It also automatically unzips all zip files.

## How does it work

This script uses the Blackboard API to get info and download files from Blackboard.
The university I work for sadly disallows anyone from authenticating to their Blackbord API instance (I even asked them politely), so I worked around that by taking a session cookie from the browser to authenticate.
I can already authenticate to Blackboard from the browser, so I don't get why they won't let me authenticate directly the API's, but whatever...this worked just fine.

## How to run this

Run `npm install` to pull down dependencies, and then `node index.js` from the root project folder.
Need at least node version 20 to run this.

### Environment Variables

Rename `.env.sample` to `.env` and fill out the values for your use case.

**BLACKBOARD_API_BASE_URL**: This is the base URL for the Blackboard API. All institutions will have a slightly different one -- for example: "https://myschool.blackboard.com/learn/api/public/v1" (where myschool is replaced with your school's subdomain).

**COURSE_ID**: This is the course id for the course you want to download assignment submissions from. I'm not really sure if I'm missing something, but using any of the "ids" listed on Blackboard for the course didn't actually work -- instead I had to go digging into a network call in the browser to find the "actual" id. To do this, I went to the course "home page" in the browser, opened up dev tools, checked the first request (where it constructs the page), looked at the request url, and took the value of the `course_id` query param.

**SESSION_COOKIE**: This is needed to authenticate with the API (at least for my institution for the reason detailed above). To get this, I logged into Blackboard in the browser, opened up dev tools, and grabbed the entire Cookie string from the request headers (it's LONG). Not sure how long it lasts for before it expires; it took me about two hours to make this script and it never expired on me during that time. It's likely that the ENTIRE cookie string isn't needed, but I didn't have time to look into it.

**DESTINATION_DIR**: This is the file path where the script will downloading files to the computer.

### Resulting File Structure of Downloaded Content

Starting from the destination directory (env var), the file paths created will be in this format:

**assignmentName/studentUsername_studentFirstName_studentLastName_attempt_attemptNumber/fileName**

For example, this could look like this:

**assignment1_helloWorld/jsmith_John_Smith/attempt_1/helloWorld.java**

If the file is a zip file, it will automatically unzip the zip file to a folder of the same name as the file in the same location.

## References

I used the Blackboard API documentation found [here](https://developer.blackboard.com/portal/displayApi) to get all of this working.

Feel free to use this repo as a reference for working with the Blackboard API!

## Future Plans

I made this in two hours and will probably never touch it again unless Blackboard changes up their API and forces me to make compatibility updates. I *should* probably add Typescript to this to look out for my future self in the case that I ever need to make an update to this, but we'll see (narrator: he will never do it).
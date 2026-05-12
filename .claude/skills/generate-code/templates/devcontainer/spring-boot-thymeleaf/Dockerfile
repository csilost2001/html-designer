FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /build
COPY pom.xml ./
COPY .mvn .mvn
COPY mvnw mvnw
RUN ./mvnw -B dependency:go-offline || mvn -B dependency:go-offline
COPY src ./src
RUN ./mvnw -B clean package -DskipTests || mvn -B clean package -DskipTests

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=builder /build/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
